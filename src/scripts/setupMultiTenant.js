/**
 * Setup Multi-Tenant Database Migration
 *
 * This script safely migrates an existing single-tenant database to multi-tenant:
 * 1. Creates the companies table
 * 2. Adds companyId columns as nullable
 * 3. Creates a default company and assigns all records
 * 4. Makes companyId columns NOT NULL
 * 5. Creates a superadmin user
 *
 * Usage: node src/scripts/setupMultiTenant.js
 */

require('dotenv').config();
const { sequelize } = require('../models');
const bcrypt = require('bcryptjs');

const DEFAULT_COMPANY = {
  name: 'Default Company',
  email: 'default@company.com',
  phone: '',
  address: '',
  status: 'active',
};

const SUPERADMIN = {
  name: 'Super Admin',
  email: 'superadmin@erp.com',
  password: 'superadmin123',
};

async function setupMultiTenant() {
  try {
    console.log('Starting multi-tenant setup...\n');

    // Step 1: Create companies table if not exists
    console.log('Step 1: Creating companies table...');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        address TEXT,
        phone VARCHAR(50),
        email VARCHAR(255),
        status VARCHAR(20) DEFAULT 'active' NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);
    console.log('  Companies table ready.\n');

    // Step 2: Add superadmin to role enum if not exists
    console.log('Step 2: Updating users role enum...');
    try {
      await sequelize.query(`ALTER TYPE enum_users_role ADD VALUE IF NOT EXISTS 'superadmin' BEFORE 'admin';`);
      console.log('  Added superadmin role.\n');
    } catch (e) {
      console.log('  Superadmin role already exists.\n');
    }

    // Step 3: Add companyId columns to all tables (nullable first)
    console.log('Step 3: Adding companyId columns...');
    const tables = ['users', 'customers', 'products', 'inventory', 'sales', 'purchases'];

    for (const table of tables) {
      try {
        const [columns] = await sequelize.query(`
          SELECT column_name FROM information_schema.columns
          WHERE table_name = '${table}' AND column_name = 'companyId';
        `);

        if (columns.length === 0) {
          await sequelize.query(`ALTER TABLE "${table}" ADD COLUMN "companyId" INTEGER;`);
          console.log(`  Added companyId to ${table}`);
        } else {
          console.log(`  companyId already exists in ${table}`);
        }
      } catch (e) {
        console.log(`  Error with ${table}: ${e.message}`);
      }
    }
    console.log('');

    // Step 4: Create default company
    console.log('Step 4: Creating default company...');
    const [existingCompanies] = await sequelize.query(`SELECT id FROM companies WHERE name = '${DEFAULT_COMPANY.name}' LIMIT 1;`);

    let companyId;
    if (existingCompanies.length === 0) {
      const [result] = await sequelize.query(`
        INSERT INTO companies (name, email, phone, address, status, "createdAt", "updatedAt")
        VALUES ('${DEFAULT_COMPANY.name}', '${DEFAULT_COMPANY.email}', '${DEFAULT_COMPANY.phone}', '${DEFAULT_COMPANY.address}', '${DEFAULT_COMPANY.status}', NOW(), NOW())
        RETURNING id;
      `);
      companyId = result[0].id;
      console.log(`  Created: ${DEFAULT_COMPANY.name} (ID: ${companyId})\n`);
    } else {
      companyId = existingCompanies[0].id;
      console.log(`  Already exists: ${DEFAULT_COMPANY.name} (ID: ${companyId})\n`);
    }

    // Step 5: Assign all records to default company
    console.log('Step 5: Assigning records to default company...');
    for (const table of tables) {
      if (table === 'users') {
        // Don't update superadmin users
        const [result] = await sequelize.query(`
          UPDATE "${table}" SET "companyId" = ${companyId}
          WHERE "companyId" IS NULL AND (role IS NULL OR role != 'superadmin');
        `);
        console.log(`  Updated ${table}: ${result?.rowCount || 0} rows`);
      } else {
        const [result] = await sequelize.query(`
          UPDATE "${table}" SET "companyId" = ${companyId} WHERE "companyId" IS NULL;
        `);
        console.log(`  Updated ${table}: ${result?.rowCount || 0} rows`);
      }
    }
    console.log('');

    // Step 6: Add foreign key constraints and NOT NULL (except users)
    console.log('Step 6: Adding foreign key constraints...');
    for (const table of tables) {
      try {
        // Check if constraint already exists
        const [constraints] = await sequelize.query(`
          SELECT constraint_name FROM information_schema.table_constraints
          WHERE table_name = '${table}' AND constraint_name = '${table}_companyId_fkey';
        `);

        if (constraints.length === 0) {
          if (table === 'users') {
            // Users can have NULL companyId (for superadmin)
            await sequelize.query(`
              ALTER TABLE "${table}"
              ADD CONSTRAINT "${table}_companyId_fkey"
              FOREIGN KEY ("companyId") REFERENCES companies(id) ON DELETE SET NULL ON UPDATE CASCADE;
            `);
          } else {
            // Other tables require companyId
            await sequelize.query(`
              ALTER TABLE "${table}" ALTER COLUMN "companyId" SET NOT NULL;
            `);
            await sequelize.query(`
              ALTER TABLE "${table}"
              ADD CONSTRAINT "${table}_companyId_fkey"
              FOREIGN KEY ("companyId") REFERENCES companies(id) ON DELETE CASCADE ON UPDATE CASCADE;
            `);
          }
          console.log(`  Added constraint to ${table}`);
        } else {
          console.log(`  Constraint already exists for ${table}`);
        }
      } catch (e) {
        console.log(`  Error with ${table}: ${e.message}`);
      }
    }
    console.log('');

    // Step 7: Add composite unique index for products (sku + companyId)
    console.log('Step 7: Adding composite unique index for products...');
    try {
      const [indexes] = await sequelize.query(`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'products' AND indexname = 'products_sku_company_unique';
      `);

      if (indexes.length === 0) {
        // First remove the old unique constraint on sku if it exists
        try {
          await sequelize.query(`ALTER TABLE products DROP CONSTRAINT IF EXISTS products_sku_key;`);
          console.log('  Removed old sku unique constraint');
        } catch (e) {
          // Ignore if doesn't exist
        }

        await sequelize.query(`
          CREATE UNIQUE INDEX "products_sku_company_unique" ON products (sku, "companyId");
        `);
        console.log('  Created composite unique index for products (sku + companyId)\n');
      } else {
        console.log('  Composite index already exists\n');
      }
    } catch (e) {
      console.log(`  Error: ${e.message}\n`);
    }

    // Step 8: Create superadmin user
    console.log('Step 8: Creating superadmin user...');
    const [existingSuperadmin] = await sequelize.query(`SELECT id FROM users WHERE role = 'superadmin' LIMIT 1;`);

    if (existingSuperadmin.length === 0) {
      const hashedPassword = await bcrypt.hash(SUPERADMIN.password, 10);
      await sequelize.query(`
        INSERT INTO users (name, email, password, role, "companyId", "createdAt", "updatedAt")
        VALUES ('${SUPERADMIN.name}', '${SUPERADMIN.email}', '${hashedPassword}', 'superadmin', NULL, NOW(), NOW());
      `);
      console.log(`  Created superadmin: ${SUPERADMIN.email}\n`);
    } else {
      console.log('  Superadmin already exists\n');
    }

    console.log('========================================');
    console.log('Multi-tenant setup completed successfully!');
    console.log('========================================\n');

    console.log('Superadmin credentials:');
    console.log(`  Email: ${SUPERADMIN.email}`);
    console.log(`  Password: ${SUPERADMIN.password}`);
    console.log('\nIMPORTANT: Please change this password after first login!');

    process.exit(0);
  } catch (error) {
    console.error('\nSetup failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

setupMultiTenant();
