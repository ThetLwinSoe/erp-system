-- Extends Credit Control (see 006_add_credit_control.sql) with:
--
-- creditTermDays (customers): NULL by default, meaning "no fixed term / not
-- tracked for overdue purposes" - same opt-in convention as creditLimit.
-- When set, it's the number of days after an order before it counts as
-- overdue (see src/controllers/customers.controller.js's
-- _computeCreditStatus, which uses a FIFO-oldest-first equivalence:
-- overdue = max(0, grossOverdueOrders - totalPaymentsReceived)).
--
-- saleId / purchaseId (payments): NULL-able links from a payment back to the
-- specific Sale/Purchase order it was recorded against. Payments are now
-- created from that order's detail page (SaleDetails.jsx/PurchaseDetails.jsx)
-- instead of a standalone picker, so going forward every new payment has
-- exactly one of these set. Purely for traceability/per-order Paid-Balance
-- display - the outstanding-balance math still sums by customerId/direction
-- regardless of linkage, so this is additive and doesn't change existing
-- figures.
--
-- Safe to re-run: ADD COLUMN IF NOT EXISTS is a no-op if already applied.

BEGIN;

ALTER TABLE customers ADD COLUMN IF NOT EXISTS "creditTermDays" INTEGER;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS "saleId" INTEGER REFERENCES sales(id);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS "purchaseId" INTEGER REFERENCES purchases(id);

COMMIT;

-- Verify: all three columns exist.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE (table_name = 'customers' AND column_name = 'creditTermDays')
   OR (table_name = 'payments' AND column_name IN ('saleId', 'purchaseId'));
