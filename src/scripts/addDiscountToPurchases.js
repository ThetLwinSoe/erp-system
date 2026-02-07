require('dotenv').config();
const { sequelize } = require('../models');

async function addDiscountFields() {
  try {
    console.log('Adding discount fields to purchases, purchase_items, purchase_returns, and purchase_return_items tables...\n');

    // Add order-level discount to purchases table
    console.log('Step 1: Updating purchases table...');
    await sequelize.query(`
      ALTER TABLE purchases
      ADD COLUMN IF NOT EXISTS "discountPercent" DECIMAL(5, 2) DEFAULT 0 NOT NULL,
      ADD COLUMN IF NOT EXISTS "discountAmount" DECIMAL(12, 2) DEFAULT 0 NOT NULL;
    `);

    // Add constraint for purchases
    await sequelize.query(`
      DO $$ BEGIN
        ALTER TABLE purchases
        ADD CONSTRAINT check_purchase_discount_percent_range
        CHECK ("discountPercent" >= 0 AND "discountPercent" <= 100);
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    console.log('✓ Purchases table updated');

    // Add item-level discount to purchase_items table
    console.log('Step 2: Updating purchase_items table...');
    await sequelize.query(`
      ALTER TABLE purchase_items
      ADD COLUMN IF NOT EXISTS "discountPercent" DECIMAL(5, 2) DEFAULT 0 NOT NULL,
      ADD COLUMN IF NOT EXISTS "discountAmount" DECIMAL(12, 2) DEFAULT 0 NOT NULL;
    `);

    // Add constraint for purchase_items
    await sequelize.query(`
      DO $$ BEGIN
        ALTER TABLE purchase_items
        ADD CONSTRAINT check_purchase_item_discount_percent_range
        CHECK ("discountPercent" >= 0 AND "discountPercent" <= 100);
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    console.log('✓ Purchase_items table updated');

    // Add order-level discount to purchase_returns table
    console.log('Step 3: Updating purchase_returns table...');
    await sequelize.query(`
      ALTER TABLE purchase_returns
      ADD COLUMN IF NOT EXISTS "discountPercent" DECIMAL(5, 2) DEFAULT 0 NOT NULL,
      ADD COLUMN IF NOT EXISTS "discountAmount" DECIMAL(12, 2) DEFAULT 0 NOT NULL;
    `);

    // Add constraint for purchase_returns
    await sequelize.query(`
      DO $$ BEGIN
        ALTER TABLE purchase_returns
        ADD CONSTRAINT check_purchase_return_discount_percent_range
        CHECK ("discountPercent" >= 0 AND "discountPercent" <= 100);
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    console.log('✓ Purchase_returns table updated');

    // Add item-level discount to purchase_return_items table
    console.log('Step 4: Updating purchase_return_items table...');
    await sequelize.query(`
      ALTER TABLE purchase_return_items
      ADD COLUMN IF NOT EXISTS "discountPercent" DECIMAL(5, 2) DEFAULT 0 NOT NULL,
      ADD COLUMN IF NOT EXISTS "discountAmount" DECIMAL(12, 2) DEFAULT 0 NOT NULL;
    `);

    // Add constraint for purchase_return_items
    await sequelize.query(`
      DO $$ BEGIN
        ALTER TABLE purchase_return_items
        ADD CONSTRAINT check_purchase_return_item_discount_percent_range
        CHECK ("discountPercent" >= 0 AND "discountPercent" <= 100);
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    console.log('✓ Purchase_return_items table updated');

    console.log('\n✅ All discount fields added successfully!');
    console.log('\nSummary of changes:');
    console.log('  - purchases: added discountPercent, discountAmount (order-level)');
    console.log('  - purchase_items: added discountPercent, discountAmount (item-level)');
    console.log('  - purchase_returns: added discountPercent, discountAmount (order-level)');
    console.log('  - purchase_return_items: added discountPercent, discountAmount (item-level)');
    console.log('\nAll fields have default value 0 and constraints 0-100 for percentages.');

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    console.error('\nError details:', error.message);
    process.exit(1);
  }
}

addDiscountFields();
