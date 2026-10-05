const { DataTypes } = require('sequelize');
const { EXPENSE_CATEGORY } = require('../utils/constants');

module.exports = (sequelize) => {
  const Expense = sequelize.define(
    'Expense',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'companies',
          key: 'id',
        },
      },
      // Who recorded the expense. Not a filter - edit/delete rules are enforced by the controller.
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
      },
      expenseDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      // Stored as a plain string (matches the VARCHAR column in migration 010); the
      // allowed values are enforced here and by expenseValidation.
      category: {
        type: DataTypes.STRING(50),
        allowNull: false,
        validate: {
          isIn: [Object.values(EXPENSE_CATEGORY)],
        },
      },
      amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        validate: {
          min: 0.01,
        },
      },
      paidTo: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      paymentMethod: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      reference: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: 'expenses',
      timestamps: true,
    }
  );

  return Expense;
};
