-- Prevent deleting a Product from silently destroying historical Sale/Purchase/Return/
-- Adjustment records that reference it.
--
-- Context: none of these productId foreign keys ever specified `onDelete` in the Sequelize
-- models, so Sequelize's sync() defaulted the underlying Postgres constraint to
-- ON DELETE CASCADE (the default for a non-nullable belongsTo column). Deleting a product
-- that had ever been sold, purchased, returned, or adjusted silently deleted every
-- SaleItem/PurchaseItem/SalesReturnItem/PurchaseReturnItem/InventoryAdjustmentItem row that
-- referenced it too - rewriting historical order/adjustment data with no warning.
--
-- `inventory_productId_fkey` is deliberately left as CASCADE: that table holds current
-- stock state, not history, and ProductsController.delete() already explicitly clears it
-- before destroying the product.
--
-- As with 001_add_foc_quantity.sql: this app boots with a plain `sequelize.sync()` (see
-- server.js), which only creates tables that don't exist yet - it never alters constraints
-- on tables that already exist. So this must be run manually against any database that
-- already has these tables (which is every real environment, including this one).
--
-- Safe to re-run: DROP CONSTRAINT IF EXISTS is a no-op if already applied.

BEGIN;

ALTER TABLE sale_items DROP CONSTRAINT IF EXISTS "sale_items_productId_fkey";
ALTER TABLE sale_items ADD CONSTRAINT "sale_items_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES products(id) ON DELETE RESTRICT;

ALTER TABLE purchase_items DROP CONSTRAINT IF EXISTS "purchase_items_productId_fkey";
ALTER TABLE purchase_items ADD CONSTRAINT "purchase_items_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES products(id) ON DELETE RESTRICT;

ALTER TABLE sales_return_items DROP CONSTRAINT IF EXISTS "sales_return_items_productId_fkey";
ALTER TABLE sales_return_items ADD CONSTRAINT "sales_return_items_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES products(id) ON DELETE RESTRICT;

ALTER TABLE purchase_return_items DROP CONSTRAINT IF EXISTS "purchase_return_items_productId_fkey";
ALTER TABLE purchase_return_items ADD CONSTRAINT "purchase_return_items_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES products(id) ON DELETE RESTRICT;

ALTER TABLE inventory_adjustment_items DROP CONSTRAINT IF EXISTS "inventory_adjustment_items_productId_fkey";
ALTER TABLE inventory_adjustment_items ADD CONSTRAINT "inventory_adjustment_items_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES products(id) ON DELETE RESTRICT;

COMMIT;

-- Verify: all five below should show delete_rule = 'RESTRICT'. inventory_productId_fkey
-- is intentionally not touched by this migration and should still show CASCADE.
SELECT tc.table_name, tc.constraint_name, rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' AND kcu.column_name = 'productId'
ORDER BY tc.table_name;
