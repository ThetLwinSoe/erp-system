const { Sequelize } = require('sequelize');
const config = require('../config/database');

const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env];

const sequelize = new Sequelize(
  dbConfig.database,
  dbConfig.username,
  dbConfig.password,
  {
    host: dbConfig.host,
    port: dbConfig.port,
    dialect: dbConfig.dialect,
    logging: dbConfig.logging,
    pool: dbConfig.pool,
  }
);

// Import models
const User = require('./User')(sequelize);
const Customer = require('./Customer')(sequelize);
const Product = require('./Product')(sequelize);
const Inventory = require('./Inventory')(sequelize);
const Sale = require('./Sale')(sequelize);
const SaleItem = require('./SaleItem')(sequelize);
const Purchase = require('./Purchase')(sequelize);
const PurchaseItem = require('./PurchaseItem')(sequelize);

// Define associations

// Product - Inventory (One-to-One)
Product.hasOne(Inventory, { foreignKey: 'productId', as: 'inventory' });
Inventory.belongsTo(Product, { foreignKey: 'productId', as: 'product' });

// Customer - Sales (One-to-Many)
Customer.hasMany(Sale, { foreignKey: 'customerId', as: 'sales' });
Sale.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });

// User - Sales (One-to-Many)
User.hasMany(Sale, { foreignKey: 'userId', as: 'sales' });
Sale.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Sale - SaleItems (One-to-Many)
Sale.hasMany(SaleItem, { foreignKey: 'saleId', as: 'items' });
SaleItem.belongsTo(Sale, { foreignKey: 'saleId', as: 'sale' });

// Product - SaleItems (One-to-Many)
Product.hasMany(SaleItem, { foreignKey: 'productId', as: 'saleItems' });
SaleItem.belongsTo(Product, { foreignKey: 'productId', as: 'product' });

// Customer (as Supplier) - Purchases (One-to-Many)
Customer.hasMany(Purchase, { foreignKey: 'supplierId', as: 'purchases' });
Purchase.belongsTo(Customer, { foreignKey: 'supplierId', as: 'supplier' });

// User - Purchases (One-to-Many)
User.hasMany(Purchase, { foreignKey: 'userId', as: 'purchases' });
Purchase.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Purchase - PurchaseItems (One-to-Many)
Purchase.hasMany(PurchaseItem, { foreignKey: 'purchaseId', as: 'items' });
PurchaseItem.belongsTo(Purchase, { foreignKey: 'purchaseId', as: 'purchase' });

// Product - PurchaseItems (One-to-Many)
Product.hasMany(PurchaseItem, { foreignKey: 'productId', as: 'purchaseItems' });
PurchaseItem.belongsTo(Product, { foreignKey: 'productId', as: 'product' });

module.exports = {
  sequelize,
  Sequelize,
  User,
  Customer,
  Product,
  Inventory,
  Sale,
  SaleItem,
  Purchase,
  PurchaseItem,
};
