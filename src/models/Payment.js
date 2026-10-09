const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Payment = sequelize.define(
    'Payment',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      // Generated in payments.controller.js, not here: Sequelize runs allowNull
      // validation before beforeCreate hooks fire, so a hook can't populate a
      // required field in time (the pattern Sale/Purchase/etc. appear to use
      // for orderNumber only works because their service layer already passes
      // it into .create() explicitly - their hooks are an unreachable no-op).
      paymentNumber: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
      },
      customerId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'customers',
          key: 'id',
        },
      },
      // Exactly one of saleId/purchaseId is set - a payment is always
      // recorded from a specific Sale or Purchase order's detail page (see
      // SaleDetails.jsx/PurchaseDetails.jsx), which is also what the server
      // uses to derive customerId/direction on create (see
      // payments.controller.js). Both nullable since the underlying balance
      // math (_computeCreditStatus) only ever sums by customerId/direction -
      // these are purely for traceability ("which order was this for") and
      // per-order Paid/Balance Due display, not part of that calculation.
      saleId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'sales',
          key: 'id',
        },
      },
      purchaseId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'purchases',
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
      direction: {
        type: DataTypes.ENUM('received', 'paid'),
        allowNull: false,
      },
      amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        validate: {
          min: 0.01,
        },
      },
      paymentDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      method: {
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
      tableName: 'payments',
      timestamps: true,
    }
  );

  return Payment;
};
