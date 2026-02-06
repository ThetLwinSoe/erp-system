require('dotenv').config();
const { sequelize } = require('../models');

async function addDiscountFields() {
  try {
    console.log('Adding discount fields to sales, sale_items, sales_returns, and sales_return_items tables...\n');

    // Add order-level discount to sales table
    console.log('Step 1: Updating sales table...');
    await sequelize.query(`
      ALTER TABLE sales
      ADD COLUMN IF NOT EXISTS "discountPercent" DECIMAL(5, 2) DEFAULT 0 NOT NULL,
      ADD COLUMN IF NOT EXISTS "discountAmount" DECIMAL(12, 2) DEFAULT 0 NOT NULL;
    `);

    // Add constraint for sales
    await sequelize.query(`
      DO $$ BEGIN
        ALTER TABLE sales
        ADD CONSTRAINT check_discount_percent_range
        CHECK ("discountPercent" >= 0 AND "discountPercent" <= 100);
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    console.log('✓ Sales table updated');

    // Add item-level discount to sale_items table
    console.log('Step 2: Updating sale_items table...');
    await sequelize.query(`
      ALTER TABLE sale_items
      ADD COLUMN IF NOT EXISTS "discountPercent" DECIMAL(5, 2) DEFAULT 0 NOT NULL,
      ADD COLUMN IF NOT EXISTS "discountAmount" DECIMAL(12, 2) DEFAULT 0 NOT NULL;
    `);

    // Add constraint for sale_items
    await sequelize.query(`
      DO $$ BEGIN
        ALTER TABLE sale_items
        ADD CONSTRAINT check_item_discount_percent_range
        CHECK ("discountPercent" >= 0 AND "discountPercent" <= 100);
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    console.log('✓ Sale_items table updated');

    // Add order-level discount to sales_returns table
    console.log('Step 3: Updating sales_returns table...');
    await sequelize.query(`
      ALTER TABLE sales_returns
      ADD COLUMN IF NOT EXISTS "discountPercent" DECIMAL(5, 2) DEFAULT 0 NOT NULL,
      ADD COLUMN IF NOT EXISTS "discountAmount" DECIMAL(12, 2) DEFAULT 0 NOT NULL;
    `);

    // Add constraint for sales_returns
    await sequelize.query(`
      DO $$ BEGIN
        ALTER TABLE sales_returns
        ADD CONSTRAINT check_discount_percent_range_returns
        CHECK ("discountPercent" >= 0 AND "discountPercent" <= 100);
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    console.log('✓ Sales_returns table updated');

    // Add item-level discount to sales_return_items table
    console.log('Step 4: Updating sales_return_items table...');
    await sequelize.query(`
      ALTER TABLE sales_return_items
      ADD COLUMN IF NOT EXISTS "discountPercent" DECIMAL(5, 2) DEFAULT 0 NOT NULL,
      ADD COLUMN IF NOT EXISTS "discountAmount" DECIMAL(12, 2) DEFAULT 0 NOT NULL;
    `);

    // Add constraint for sales_return_items
    await sequelize.query(`
      DO $$ BEGIN
        ALTER TABLE sales_return_items
        ADD CONSTRAINT check_return_item_discount_percent_range
        CHECK ("discountPercent" >= 0 AND "discountPercent" <= 100);
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    console.log('✓ Sales_return_items table updated');

    console.log('\n✅ All discount fields added successfully!');
    console.log('\nSummary of changes:');
    console.log('  - sales: added discountPercent, discountAmount (order-level)');
    console.log('  - sale_items: added discountPercent, discountAmount (item-level)');
    console.log('  - sales_returns: added discountPercent, discountAmount (order-level)');
    console.log('  - sales_return_items: added discountPercent, discountAmount (item-level)');
    console.log('\nAll fields have default value 0 and constraints 0-100 for percentages.');

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    console.error('\nError details:', error.message);
    process.exit(1);
  }
}

addDiscountFields();
