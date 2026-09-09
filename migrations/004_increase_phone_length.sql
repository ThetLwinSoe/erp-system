-- Widen the phone column on companies and customers (customers also holds
-- suppliers, via its `type` enum) from VARCHAR(50) to VARCHAR(150).
--
-- Context: users routinely enter multiple numbers in one phone field (e.g.
-- "09-43091609, 09-974501873, (Viber No: 09-974501874)"), which exceeds 50
-- chars. The app's validation never enforced a max length, so these values
-- passed straight through to Postgres, which rejected them with
-- "value too long for type character varying(50)" - shown raw in dev, masked
-- as a generic "Database error occurred" in production (NODE_ENV-dependent
-- error detail, see src/middleware/errorHandler.js). The application-level
-- fix now caps phone input at 150 chars up front; this migration raises the
-- actual column limit to match.
--
-- As with 001_add_foc_quantity.sql, 002_restrict_product_delete_cascade.sql,
-- and 003_add_subscription_end_date.sql: this app boots with a plain
-- `sequelize.sync()` (see server.js), which only creates tables that don't
-- exist yet - it never alters columns on tables that already exist. So this
-- must be run manually against any database that already has these tables
-- (which is every real environment, including this one).
--
-- Safe to re-run: widening a VARCHAR is a metadata-only change in Postgres
-- (no table rewrite, no re-validation of existing rows) and running it again
-- with the same or larger target length is a no-op.

BEGIN;

ALTER TABLE companies ALTER COLUMN phone TYPE VARCHAR(150);
ALTER TABLE customers ALTER COLUMN phone TYPE VARCHAR(150);

COMMIT;

-- Verify: both rows below should show character_maximum_length = 150.
SELECT table_name, column_name, character_maximum_length
FROM information_schema.columns
WHERE table_name IN ('companies', 'customers') AND column_name = 'phone';
