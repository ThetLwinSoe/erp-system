-- Adds the Expense Tracker feature: an optional, per-company operating-expense ledger that
-- reduces net profit in the Profit & Loss report when it is switched on.
--
-- Two opt-in switches, mirroring Credit Control:
--   1. companies.expenseTrackerEnabled  - superadmin-controlled, for the whole tenant.
--   2. users.expenseTrackerAccess       - the tenant admin grants this per user.
--
-- The expenses table is created here rather than left to sequelize.sync(), so that its
-- index can be created in the same run. sync() only creates tables that don't exist yet and
-- never adds columns to existing tables, so the two ALTERs must be run by hand on every
-- database that already has companies and users (which is every real environment).
--
-- Must be run before the backend that uses these columns is deployed.
-- Safe to re-run: every statement is IF NOT EXISTS.

BEGIN;

ALTER TABLE companies ADD COLUMN IF NOT EXISTS "expenseTrackerEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "expenseTrackerAccess" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id),
  "userId" INTEGER NOT NULL REFERENCES users(id),
  "expenseDate" DATE NOT NULL,
  category VARCHAR(50) NOT NULL,
  amount DECIMAL(12,2) NOT NULL CHECK (amount >= 0.01),
  "paidTo" VARCHAR(255),
  "paymentMethod" VARCHAR(50),
  reference VARCHAR(100),
  notes TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expenses_company_id_expense_date_idx ON expenses ("companyId", "expenseDate");

COMMIT;

-- Verify: both columns should exist, and the expenses table and its index should be listed.
SELECT table_name, column_name
FROM information_schema.columns
WHERE (table_name = 'companies' AND column_name = 'expenseTrackerEnabled')
   OR (table_name = 'users' AND column_name = 'expenseTrackerAccess')
UNION ALL
SELECT 'expenses', indexname FROM pg_indexes WHERE indexname = 'expenses_company_id_expense_date_idx';
