const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const InventoryAdjustmentItem = sequelize.define(
    'InventoryAdjustmentItem',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      inventoryAdjustmentId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'inventory_adjustments',
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
      adjustmentType: {
        type: DataTypes.STRING(10),
        allowNull: false,
        validate: {
          isIn: [['add', 'remove', 'set']],
        },
      },
      quantityBefore: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      quantityAdjusted: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          min: 0,
        },
      },
      quantityAfter: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      tableName: 'inventory_adjustment_items',
      timestamps: true,
      hooks: {
        beforeCreate: (item) => {
          item.quantityAfter = calculateQuantityAfter(item);
        },
        beforeUpdate: (item) => {
          if (item.changed('adjustmentType') || item.changed('quantityAdjusted') || item.changed('quantityBefore')) {
            item.quantityAfter = calculateQuantityAfter(item);
          }
        },
      },
    }
  );

  return InventoryAdjustmentItem;
};

function calculateQuantityAfter(item) {
  switch (item.adjustmentType) {
    case 'add':
      return item.quantityBefore + item.quantityAdjusted;
    case 'remove':
      return Math.max(0, item.quantityBefore - item.quantityAdjusted);
    case 'set':
      return item.quantityAdjusted;
    default:
      return item.quantityBefore;
  }
}
