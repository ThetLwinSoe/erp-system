-- Adds the indexes the Credit Control feature's "calculated status and
-- filter" paths need (Payment status on Sales/Purchases listings, Balance
-- on the Customers listing - their display, sort, and filter paths all
-- rest on payments.controller.js/sales.controller.js/purchases.controller.js/
-- customers.controller.js's correlated subqueries).
--
-- Not needed for the plain "attach to current page" display path (one
-- JOIN+GROUP BY per page load, cost scales with page size) - needed for
-- `sortBy=balance`/`paymentStatus` and `paymentStatus=unpaid/partial/paid`,
-- which evaluate the subquery once per row of the *whole* matching set
-- before paginating. Confirmed via EXPLAIN ANALYZE against a simulated
-- ~10,800-row payments table (inside a rolled-back transaction, no trace
-- left in real data): the payments("saleId") index alone took the
-- `paymentStatus` sort from a 54ms sequential scan to a 5.4ms index scan.
--
-- Beyond primary keys, none of these tables had any indexes at all before
-- this migration - every one of these queries was a full sequential scan.
-- Harmless at current data volume, but closing the gap now avoids it
-- becoming a real problem as `payments` (an append-only ledger) grows.
--
-- As with 001-007: `sequelize.sync()` only creates brand-new tables, never
-- adds indexes to tables that already exist, so this must be run manually.
-- These are plain (non-unique) indexes, declared only here and not mirrored
-- in the Sequelize models - same convention already used for the unique
-- customerCode/supplierCode indexes in 005, and deliberately so: it keeps
-- this isolated from the known sequelize.sync() duplicate-unique-index bug
-- (see memory: duplicate-unique-indexes-production-bug), which is specific
-- to model-declared `unique: true` fields.
--
-- Safe to re-run: CREATE INDEX IF NOT EXISTS is a no-op if already applied.

BEGIN;

CREATE INDEX IF NOT EXISTS payments_sale_id_idx ON payments ("saleId");
CREATE INDEX IF NOT EXISTS payments_purchase_id_idx ON payments ("purchaseId");
CREATE INDEX IF NOT EXISTS payments_customer_id_direction_idx ON payments ("customerId", direction);

CREATE INDEX IF NOT EXISTS sales_customer_id_status_created_at_idx ON sales ("customerId", status, "createdAt");
CREATE INDEX IF NOT EXISTS purchases_supplier_id_status_created_at_idx ON purchases ("supplierId", status, "createdAt");

CREATE INDEX IF NOT EXISTS sales_returns_sale_id_idx ON sales_returns ("saleId");
CREATE INDEX IF NOT EXISTS purchase_returns_purchase_id_idx ON purchase_returns ("purchaseId");

CREATE INDEX IF NOT EXISTS customers_company_id_idx ON customers ("companyId");

COMMIT;

-- Verify: all 8 new indexes exist.
SELECT tablename, indexname
FROM pg_indexes
WHERE indexname IN (
  'payments_sale_id_idx',
  'payments_purchase_id_idx',
  'payments_customer_id_direction_idx',
  'sales_customer_id_status_created_at_idx',
  'purchases_supplier_id_status_created_at_idx',
  'sales_returns_sale_id_idx',
  'purchase_returns_purchase_id_idx',
  'customers_company_id_idx'
)
ORDER BY tablename, indexname;
