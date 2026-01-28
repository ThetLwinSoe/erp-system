const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SaleItem = sequelize.define(
    'SaleItem',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      saleId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'sales',
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
      tableName: 'sale_items',
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

  return SaleItem;
};
