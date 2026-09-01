-- Add FOC (Free of Charge) quantity tracking to order/return line items.
--
-- Context: this app boots with a plain `sequelize.sync()` (see server.js), which only
-- creates tables that don't exist yet - it never adds new columns to tables that already
-- exist. So adding `focQuantity` to the Sequelize models does NOT get applied automatically
-- on restart; it must be run manually against any database that already has these tables
-- (which is every real environment, including this one).
--
-- Safe to re-run: every statement is idempotent (IF NOT EXISTS / no-op if already applied).

BEGIN;

ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS "focQuantity" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE purchase_items
  ADD COLUMN IF NOT EXISTS "focQuantity" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE sales_return_items
  ADD COLUMN IF NOT EXISTS "focQuantity" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE purchase_return_items
  ADD COLUMN IF NOT EXISTS "focQuantity" INTEGER NOT NULL DEFAULT 0;

COMMIT;

-- Verify: should return exactly 4 rows, one per table above.
SELECT table_name, column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE column_name = 'focQuantity'
ORDER BY table_name;
