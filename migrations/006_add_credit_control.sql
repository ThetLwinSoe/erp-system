-- Adds the columns needed for Credit Control (Sales AR / Purchases AP limits
-- with a warning, not a hard block, when a customer/supplier goes over).
-- The actual payment ledger (`payments` table) is a brand-new table, so it
-- doesn't need a migration - `sequelize.sync()` creates new tables on its
-- own (see server.js). Only columns added to *existing* tables need this
-- manual script, per the same `sync()` limitation documented in 001-005.
--
-- creditLimit (customers): NULL by default, meaning "no limit enforced" -
-- existing customers/suppliers are completely unaffected until someone sets
-- a value. Applies to AR when the row's type is 'customer'/'both', AP when
-- 'supplier'/'both'.
--
-- creditControlEnabled (companies): per-tenant on/off switch, default false
-- (opt-in). Controlled by superadmin from the Companies page.
--
-- creditControlAccess (users): per-user on/off switch, default false.
-- Controlled by that company's own Admin from the Users page - admin-role
-- users always have access regardless of this flag (see
-- src/middleware/companyScope.js's requireCreditControlAccess), so this only
-- actually matters for manager/staff/sale_rep users.
--
-- Safe to re-run: ADD COLUMN IF NOT EXISTS is a no-op if already applied.

BEGIN;

ALTER TABLE customers ADD COLUMN IF NOT EXISTS "creditLimit" DECIMAL(12,2);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS "creditControlEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "creditControlAccess" BOOLEAN NOT NULL DEFAULT false;

COMMIT;

-- Verify: all three columns exist with the right defaults.
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE (table_name = 'customers' AND column_name = 'creditLimit')
   OR (table_name = 'companies' AND column_name = 'creditControlEnabled')
   OR (table_name = 'users' AND column_name = 'creditControlAccess');
