-- Add a per-company subscription end date, used to show expiry-warning alerts
-- (10 days before end) to that company's own users and to superadmin across
-- all tenants. Nullable and alert-only: a company with no date set, or a date
-- more than 10 days out, shows no alert at all. Reaching/passing the date does
-- NOT restrict access on its own - the existing `status` field (active/inactive)
-- remains the only way to actually lock a company out; this is purely informational.
--
-- As with 001_add_foc_quantity.sql and 002_restrict_product_delete_cascade.sql:
-- this app boots with a plain `sequelize.sync()` (see server.js), which only
-- creates tables that don't exist yet - it never adds columns to tables that
-- already exist. So this must be run manually against any database that already
-- has the companies table (which is every real environment, including this one).
--
-- Safe to re-run: ADD COLUMN IF NOT EXISTS is a no-op if already applied.

BEGIN;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS "subscriptionEndDate" DATE;

COMMIT;

-- Verify: should return exactly 1 row.
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'companies' AND column_name = 'subscriptionEndDate';
