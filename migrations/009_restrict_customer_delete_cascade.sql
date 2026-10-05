-- Prevent deleting a Customer from silently destroying their Sale/Purchase history.
--
-- Context: sales.customerId and purchases.supplierId were created by Sequelize's sync()
-- without an explicit onDelete, so Postgres defaulted them to ON DELETE CASCADE. Deleting a
-- customer that had ever been sold to or bought from silently deleted every Sale (and its
-- SaleItems and SalesReturns) and every Purchase (and its PurchaseItems and PurchaseReturns)
-- with no warning, and without restoring the stock those orders had deducted.
--
-- The application now refuses the delete up front (CustomersController.delete) with a clear
-- message and points to Deactivate. This migration is the database-level safety net, so
-- any other path that removes a customer is blocked too: RESTRICT makes Postgres refuse the
-- delete while orders still reference the customer.
--
-- payments.customerId is already NO ACTION (blocked), so it is left as is.
--
-- As with 001-002: sequelize.sync() only creates tables that don't exist yet and never alters
-- constraints on existing tables, so this must be run manually against any database that
-- already has these tables.
--
-- Safe to re-run: DROP CONSTRAINT IF EXISTS is a no-op if already applied.

BEGIN;

ALTER TABLE sales DROP CONSTRAINT IF EXISTS "sales_customerId_fkey";
ALTER TABLE sales ADD CONSTRAINT "sales_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES customers(id) ON DELETE RESTRICT;

ALTER TABLE purchases DROP CONSTRAINT IF EXISTS "purchases_supplierId_fkey";
ALTER TABLE purchases ADD CONSTRAINT "purchases_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES customers(id) ON DELETE RESTRICT;

COMMIT;

-- Verify: both should show delete_rule = 'RESTRICT'.
SELECT tc.table_name, tc.constraint_name, rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.constraint_name IN ('sales_customerId_fkey', 'purchases_supplierId_fkey')
ORDER BY tc.table_name;
