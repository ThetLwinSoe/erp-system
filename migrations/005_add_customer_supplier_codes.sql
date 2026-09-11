-- Add auto-generated, per-company sequential codes to customers/suppliers:
-- customerCode ("Cus00001"...) and supplierCode ("Sup00001"...). Customer and
-- Supplier are the same underlying `customers` table (see `type` column:
-- customer/supplier/both), so a 'both' row gets both codes independently.
-- Codes are permanent once assigned - never reused or renumbered on delete.
--
-- The running counters live on `companies` (lastCustomerCodeSeq/
-- lastSupplierCodeSeq) rather than a separate sequence table, since one
-- Company row already exists per tenant. New codes are assigned via an
-- atomic `UPDATE companies SET lastCustomerCodeSeq = lastCustomerCodeSeq + 1
-- ... RETURNING` in application code (src/controllers/customers.controller.js)
-- - Postgres row-locking on that single UPDATE serializes concurrent creates
-- for the same company, so no two rows in the same company can ever get the
-- same code.
--
-- As with 001-004: this app boots with a plain `sequelize.sync()` (see
-- server.js), which only creates tables that don't exist yet - it never adds
-- columns to tables that already exist. So this must be run manually against
-- any database that already has the companies/customers tables (every real
-- environment, including this one).
--
-- Safe to re-run: ADD COLUMN IF NOT EXISTS and CREATE UNIQUE INDEX IF NOT
-- EXISTS are no-ops if already applied. The backfill below is deterministic
-- (same ORDER BY every time) so re-running it against unchanged data
-- reassigns the same codes - but do not re-run it after new codes have
-- already been issued by the application, since newly inserted rows would
-- shift the ROW_NUMBER() ordering and collide with already-issued codes.

BEGIN;

ALTER TABLE customers ADD COLUMN IF NOT EXISTS "customerCode" VARCHAR(20);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS "supplierCode" VARCHAR(20);

ALTER TABLE companies ADD COLUMN IF NOT EXISTS "lastCustomerCodeSeq" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS "lastSupplierCodeSeq" INTEGER NOT NULL DEFAULT 0;

-- Backfill existing rows, ordered by when they were actually created.
WITH numbered_customers AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "companyId" ORDER BY "createdAt", id) AS seq
  FROM customers
  WHERE type IN ('customer', 'both') AND "customerCode" IS NULL
)
UPDATE customers c
SET "customerCode" = 'Cus' || LPAD(nc.seq::text, 5, '0')
FROM numbered_customers nc
WHERE c.id = nc.id;

WITH numbered_suppliers AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "companyId" ORDER BY "createdAt", id) AS seq
  FROM customers
  WHERE type IN ('supplier', 'both') AND "supplierCode" IS NULL
)
UPDATE customers c
SET "supplierCode" = 'Sup' || LPAD(ns.seq::text, 5, '0')
FROM numbered_suppliers ns
WHERE c.id = ns.id;

-- Fast-forward each company's counters to match what was just backfilled, so
-- the next application-issued code continues the sequence instead of
-- restarting at 1 and colliding with an existing backfilled code.
UPDATE companies co
SET "lastCustomerCodeSeq" = COALESCE(
  (SELECT MAX(SUBSTRING(c."customerCode" FROM 4)::int) FROM customers c WHERE c."companyId" = co.id AND c."customerCode" IS NOT NULL),
  0
);

UPDATE companies co
SET "lastSupplierCodeSeq" = COALESCE(
  (SELECT MAX(SUBSTRING(c."supplierCode" FROM 4)::int) FROM customers c WHERE c."companyId" = co.id AND c."supplierCode" IS NOT NULL),
  0
);

-- One code can never collide with another within the same company (multiple
-- NULLs are fine and expected - a pure supplier has no customerCode).
CREATE UNIQUE INDEX IF NOT EXISTS customers_company_customer_code_unique
  ON customers ("companyId", "customerCode") WHERE "customerCode" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS customers_company_supplier_code_unique
  ON customers ("companyId", "supplierCode") WHERE "supplierCode" IS NOT NULL;

COMMIT;

-- Verify: spot-check a handful of rows and confirm codes look sane and sequential per company.
SELECT "companyId", id, name, type, "customerCode", "supplierCode"
FROM customers
ORDER BY "companyId", id
LIMIT 50;

-- Verify: each company's counters should equal the count of that company's
-- customer/supplier rows (assuming no gaps from a prior partial run).
SELECT id, name, "lastCustomerCodeSeq", "lastSupplierCodeSeq" FROM companies ORDER BY id;
