const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PurchaseReturnItem = sequelize.define(
    'PurchaseReturnItem',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      purchaseReturnId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'purchase_returns',
          key: 'id',
        },
      },
      purchaseItemId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'purchase_items',
          key: 'id',
        },
      },
      productId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'products',
          key: 'id',
        },
      },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      unitPrice: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
      },
      total: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
      },
    },
    {
      tableName: 'purchase_return_items',
      timestamps: true,
    }
  );

  return PurchaseReturnItem;
};
