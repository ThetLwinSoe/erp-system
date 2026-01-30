/**
 * Migration Script: Convert existing single-tenant data to multi-tenant
 *
 * This script will:
 * 1. Create a default company for existing records
 * 2. Assign all existing records (Users, Customers, Products, Inventory, Sales, Purchases) to the default company
 * 3. Create a superadmin user if none exists
 *
 * Usage: node src/scripts/migrateToMultiTenant.js
 */

require('dotenv').config();
const { sequelize, User, Customer, Product, Inventory, Sale, Purchase, Company } = require('../models');
const bcrypt = require('bcryptjs');

const DEFAULT_COMPANY_NAME = 'Default Company';
const SUPERADMIN_EMAIL = 'superadmin@erp.com';
const SUPERADMIN_PASSWORD = 'superadmin123';

async function migrate() {
  const transaction = await sequelize.transaction();

  try {
    console.log('Starting multi-tenant migration...\n');

    // Step 1: Check if migration is needed
    const existingCompanies = await Company.count();
    if (existingCompanies > 0) {
      console.log('Migration already completed. Companies already exist.');
      const proceed = process.argv.includes('--force');
      if (!proceed) {
        console.log('Use --force flag to run migration anyway.');
        await transaction.rollback();
        process.exit(0);
      }
      console.log('--force flag detected. Proceeding with migration...\n');
    }

    // Step 2: Create default company
    console.log('Creating default company...');
    let defaultCompany = await Company.findOne({ where: { name: DEFAULT_COMPANY_NAME } });

    if (!defaultCompany) {
      defaultCompany = await Company.create({
        name: DEFAULT_COMPANY_NAME,
        email: 'default@company.com',
        phone: '',
        address: '',
        status: 'active',
      }, { transaction });
      console.log(`  Created company: ${defaultCompany.name} (ID: ${defaultCompany.id})`);
    } else {
      console.log(`  Company already exists: ${defaultCompany.name} (ID: ${defaultCompany.id})`);
    }

    // Step 3: Update existing users to belong to default company
    console.log('\nUpdating users...');
    const usersWithoutCompany = await User.findAll({
      where: { companyId: null, role: { [require('sequelize').Op.ne]: 'superadmin' } },
    });

    for (const user of usersWithoutCompany) {
      await user.update({ companyId: defaultCompany.id }, { transaction });
      console.log(`  Updated user: ${user.email}`);
    }
    console.log(`  Total users updated: ${usersWithoutCompany.length}`);

    // Step 4: Update existing customers to belong to default company
    console.log('\nUpdating customers...');
    const customersWithoutCompany = await Customer.findAll({
      where: { companyId: null },
    });

    for (const customer of customersWithoutCompany) {
      await customer.update({ companyId: defaultCompany.id }, { transaction });
    }
    console.log(`  Total customers updated: ${customersWithoutCompany.length}`);

    // Step 5: Update existing products to belong to default company
    console.log('\nUpdating products...');
    const productsWithoutCompany = await Product.findAll({
      where: { companyId: null },
    });

    for (const product of productsWithoutCompany) {
      await product.update({ companyId: defaultCompany.id }, { transaction });
    }
    console.log(`  Total products updated: ${productsWithoutCompany.length}`);

    // Step 6: Update existing inventory to belong to default company
    console.log('\nUpdating inventory...');
    const inventoryWithoutCompany = await Inventory.findAll({
      where: { companyId: null },
    });

    for (const inventory of inventoryWithoutCompany) {
      await inventory.update({ companyId: defaultCompany.id }, { transaction });
    }
    console.log(`  Total inventory records updated: ${inventoryWithoutCompany.length}`);

    // Step 7: Update existing sales to belong to default company
    console.log('\nUpdating sales...');
    const salesWithoutCompany = await Sale.findAll({
      where: { companyId: null },
    });

    for (const sale of salesWithoutCompany) {
      await sale.update({ companyId: defaultCompany.id }, { transaction });
    }
    console.log(`  Total sales updated: ${salesWithoutCompany.length}`);

    // Step 8: Update existing purchases to belong to default company
    console.log('\nUpdating purchases...');
    const purchasesWithoutCompany = await Purchase.findAll({
      where: { companyId: null },
    });

    for (const purchase of purchasesWithoutCompany) {
      await purchase.update({ companyId: defaultCompany.id }, { transaction });
    }
    console.log(`  Total purchases updated: ${purchasesWithoutCompany.length}`);

    // Step 9: Create superadmin user if it doesn't exist
    console.log('\nChecking for superadmin user...');
    let superadmin = await User.findOne({ where: { role: 'superadmin' } });

    if (!superadmin) {
      const hashedPassword = await bcrypt.hash(SUPERADMIN_PASSWORD, 10);
      superadmin = await User.create({
        name: 'Super Admin',
        email: SUPERADMIN_EMAIL,
        password: hashedPassword,
        role: 'superadmin',
        companyId: null,
      }, { transaction });
      console.log(`  Created superadmin user:`);
      console.log(`    Email: ${SUPERADMIN_EMAIL}`);
      console.log(`    Password: ${SUPERADMIN_PASSWORD}`);
      console.log('  IMPORTANT: Please change this password after first login!');
    } else {
      console.log(`  Superadmin already exists: ${superadmin.email}`);
    }

    // Commit transaction
    await transaction.commit();

    console.log('\n========================================');
    console.log('Migration completed successfully!');
    console.log('========================================\n');

    console.log('Summary:');
    console.log(`  - Default company: ${defaultCompany.name} (ID: ${defaultCompany.id})`);
    console.log(`  - Users migrated: ${usersWithoutCompany.length}`);
    console.log(`  - Customers migrated: ${customersWithoutCompany.length}`);
    console.log(`  - Products migrated: ${productsWithoutCompany.length}`);
    console.log(`  - Inventory records migrated: ${inventoryWithoutCompany.length}`);
    console.log(`  - Sales migrated: ${salesWithoutCompany.length}`);
    console.log(`  - Purchases migrated: ${purchasesWithoutCompany.length}`);

    if (!superadmin || superadmin.email === SUPERADMIN_EMAIL) {
      console.log('\nSuperadmin credentials:');
      console.log(`  Email: ${SUPERADMIN_EMAIL}`);
      console.log(`  Password: ${SUPERADMIN_PASSWORD}`);
    }

    process.exit(0);
  } catch (error) {
    await transaction.rollback();
    console.error('\nMigration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run migration
migrate();
