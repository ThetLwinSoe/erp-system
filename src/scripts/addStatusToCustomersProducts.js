require('dotenv').config();
const { sequelize } = require('../models');

async function addStatusFields() {
  try {
    console.log('Adding status field to customers and products tables...\n');

    // Add status to customers table
    console.log('Step 1: Updating customers table...');
    await sequelize.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_customers_status') THEN
          CREATE TYPE "enum_customers_status" AS ENUM ('active', 'inactive');
        END IF;
      END $$;
    `);
    await sequelize.query(`
      ALTER TABLE customers
      ADD COLUMN IF NOT EXISTS "status" "enum_customers_status" DEFAULT 'active' NOT NULL;
    `);
    console.log('  - customers table updated successfully');

    // Add status to products table
    console.log('Step 2: Updating products table...');
    await sequelize.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_products_status') THEN
          CREATE TYPE "enum_products_status" AS ENUM ('active', 'inactive');
        END IF;
      END $$;
    `);
    await sequelize.query(`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS "status" "enum_products_status" DEFAULT 'active' NOT NULL;
    `);
    console.log('  - products table updated successfully');

    console.log('\nAll status fields added successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
}

addStatusFields();
