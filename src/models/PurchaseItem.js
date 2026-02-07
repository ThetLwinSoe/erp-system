const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PurchaseItem = sequelize.define(
    'PurchaseItem',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      purchaseId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'purchases',
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
        validate: {
          min: 1,
        },
      },
      unitPrice: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
      },
      discountPercent: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: 0,
          max: 100,
        },
      },
      discountAmount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: 0,
        },
      },
      total: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
      },
      receivedQuantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      tableName: 'purchase_items',
      timestamps: true,
      hooks: {
        beforeCreate: (item) => {
          const subtotal = item.quantity * item.unitPrice;
          item.discountAmount = subtotal * (parseFloat(item.discountPercent || 0) / 100);
          item.total = subtotal - item.discountAmount;
        },
        beforeUpdate: (item) => {
          if (item.changed('quantity') || item.changed('unitPrice') || item.changed('discountPercent')) {
            const subtotal = item.quantity * item.unitPrice;
            item.discountAmount = subtotal * (parseFloat(item.discountPercent || 0) / 100);
            item.total = subtotal - item.discountAmount;
          }
        },
      },
    }
  );

  return PurchaseItem;
};
