-- Migration 012: give Payment and Expense rows their own document number,
-- matching the pattern already used by Sale.orderNumber, Purchase.orderNumber,
-- SalesReturn/PurchaseReturn.returnNumber and InventoryAdjustment.adjustmentNumber
-- (see those models' beforeCreate hooks - new rows get "PAY-<base36 timestamp>-<random4>"
-- / "EXP-<base36 timestamp>-<random4>").
--
-- payments and expenses already have live rows (both modules are already in
-- production), so this cannot be left to sequelize.sync() - as with 005/006/
-- 007/009/010/011, sync() only creates tables that don't exist yet and never
-- adds columns to a table that already exists. Must be run before the backend
-- that reads/writes these columns is deployed.
--
-- Safe to re-run: every ADD COLUMN/index is IF NOT EXISTS, SET NOT NULL is a
-- no-op once already set, and the backfill only touches rows that are still
-- NULL or still carry a short id-based number from an earlier run of this
-- file (see below) - it never touches a row that already has a real
-- timestamp+random number, whether backfilled or issued by the app.

BEGIN;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS "paymentNumber" VARCHAR(50);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "expenseNumber" VARCHAR(50);

-- Backfill pre-existing rows with a number in the exact same shape the app
-- generates for new ones, so old and new rows look identical. These two
-- helper functions are dropped again before COMMIT - DDL is transactional in
-- Postgres, so nothing persists past this migration either way.
CREATE FUNCTION pg_temp_base36(n bigint) RETURNS text AS $$
DECLARE
  chars constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  result text := '';
  val bigint := n;
BEGIN
  IF val <= 0 THEN RETURN '0'; END IF;
  WHILE val > 0 LOOP
    result := substr(chars, (val % 36)::int + 1, 1) || result;
    val := val / 36;
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE FUNCTION pg_temp_random_base36(len int) RETURNS text AS $$
DECLARE
  chars constant text := '0123456789abcdefghijklmnopqrstuvwxyz';
  result text := '';
BEGIN
  FOR i IN 1..len LOOP
    result := result || substr(chars, (floor(random() * 36) + 1)::int, 1);
  END LOOP;
  RETURN upper(result);
END;
$$ LANGUAGE plpgsql VOLATILE;

-- The timestamp half is each row's own createdAt (not now()), so it reflects
-- when that row actually happened, the same way the app's Date.now() would
-- have at the time - rather than every backfilled row sharing today's date.
UPDATE payments
SET "paymentNumber" = 'PAY-' || pg_temp_base36(floor(extract(epoch FROM "createdAt") * 1000)::bigint) || '-' || pg_temp_random_base36(4)
WHERE "paymentNumber" IS NULL OR "paymentNumber" ~ '^PAY-[0-9]+$';

UPDATE expenses
SET "expenseNumber" = 'EXP-' || pg_temp_base36(floor(extract(epoch FROM "createdAt") * 1000)::bigint) || '-' || pg_temp_random_base36(4)
WHERE "expenseNumber" IS NULL OR "expenseNumber" ~ '^EXP-[0-9]+$';

DROP FUNCTION pg_temp_base36(bigint);
DROP FUNCTION pg_temp_random_base36(int);

ALTER TABLE payments ALTER COLUMN "paymentNumber" SET NOT NULL;
ALTER TABLE expenses ALTER COLUMN "expenseNumber" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payments_payment_number_unique ON payments ("paymentNumber");
CREATE UNIQUE INDEX IF NOT EXISTS expenses_expense_number_unique ON expenses ("expenseNumber");

COMMIT;

-- Verify: both columns should exist, be NOT NULL, and have a unique index.
SELECT table_name, column_name, is_nullable
FROM information_schema.columns
WHERE (table_name = 'payments' AND column_name = 'paymentNumber')
   OR (table_name = 'expenses' AND column_name = 'expenseNumber');

SELECT indexname FROM pg_indexes
WHERE indexname IN ('payments_payment_number_unique', 'expenses_expense_number_unique');

-- Verify: spot-check that backfilled rows look sane.
SELECT id, "paymentNumber" FROM payments ORDER BY id LIMIT 20;
SELECT id, "expenseNumber" FROM expenses ORDER BY id LIMIT 20;
