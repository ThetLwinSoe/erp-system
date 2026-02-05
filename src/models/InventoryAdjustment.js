const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const InventoryAdjustment = sequelize.define(
    'InventoryAdjustment',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      adjustmentNumber: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
      },
      status: {
        type: DataTypes.STRING(20),
        defaultValue: 'pending',
        validate: {
          isIn: [['pending', 'approved', 'completed', 'cancelled']],
        },
      },
      reason: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'companies',
          key: 'id',
        },
      },
    },
    {
      tableName: 'inventory_adjustments',
      timestamps: true,
      hooks: {
        beforeCreate: async (adjustment) => {
          if (!adjustment.adjustmentNumber) {
            const timestamp = Date.now().toString(36).toUpperCase();
            const random = Math.random().toString(36).substring(2, 6).toUpperCase();
            adjustment.adjustmentNumber = `ADJ-${timestamp}-${random}`;
          }
        },
      },
    }
  );

  return InventoryAdjustment;
};
