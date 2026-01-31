const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SalesReturn = sequelize.define(
    'SalesReturn',
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
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
      },
      returnNumber: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
      },
      status: {
        type: DataTypes.ENUM('pending', 'approved', 'completed', 'cancelled'),
        defaultValue: 'pending',
      },
      subtotal: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
      tax: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
      total: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
      reason: {
        type: DataTypes.TEXT,
        allowNull: true,
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
      tableName: 'sales_returns',
      timestamps: true,
      hooks: {
        beforeCreate: async (salesReturn) => {
          if (!salesReturn.returnNumber) {
            const timestamp = Date.now().toString(36).toUpperCase();
            const random = Math.random().toString(36).substring(2, 6).toUpperCase();
            salesReturn.returnNumber = `SR-${timestamp}-${random}`;
          }
        },
      },
    }
  );

  return SalesReturn;
};
