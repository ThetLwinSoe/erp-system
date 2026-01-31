const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SalesReturnItem = sequelize.define(
    'SalesReturnItem',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      salesReturnId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'sales_returns',
          key: 'id',
        },
      },
      saleItemId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'sale_items',
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
      total: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
      },
    },
    {
      tableName: 'sales_return_items',
      timestamps: true,
      hooks: {
        beforeCreate: (item) => {
          item.total = item.quantity * item.unitPrice;
        },
        beforeUpdate: (item) => {
          if (item.changed('quantity') || item.changed('unitPrice')) {
            item.total = item.quantity * item.unitPrice;
          }
        },
      },
    }
  );

  return SalesReturnItem;
};
