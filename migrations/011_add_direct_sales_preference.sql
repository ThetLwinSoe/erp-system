-- Migration 011: remember each user's "Direct sale" choice on Create Sales Order.
--
-- Adds users.directSalesEnabled. The backend saves it when an order is created
-- (see sales.service.js createSale), so it has to exist before the backend
-- that reads or writes it is deployed.
--
-- Safe to re-run: the column is added only if it isn't there yet.

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS "directSalesEnabled" BOOLEAN NOT NULL DEFAULT false;

COMMIT;

-- Verify: the column should be listed.
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'users' AND column_name = 'directSalesEnabled';
