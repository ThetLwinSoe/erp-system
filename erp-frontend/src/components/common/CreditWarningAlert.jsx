import { Alert } from 'react-bootstrap';
import { FaExclamationTriangle } from 'react-icons/fa';
import { formatCurrency } from '../../utils/currency';

/**
 * Compact, non-blocking Credit Control warning - shown both when creating a
 * new order (projected balance = current outstanding + the order being
 * built) and when reviewing an already-created Pending order before
 * confirming/approving it (projected balance = current outstanding + that
 * order's own total, since Pending orders are excluded from `outstanding`
 * until confirmed - see customers.controller.js's _computeCreditStatus).
 * Renders nothing when neither condition applies.
 */
const CreditWarningAlert = ({ creditStatus, orderTotal, type, currency }) => {
  if (!creditStatus) return null;

  const outstanding = type === 'customer' ? creditStatus.outstandingReceivable : creditStatus.outstandingPayable;
  const overdue = type === 'customer' ? creditStatus.overdueReceivable : creditStatus.overduePayable;
  const projected = outstanding + (parseFloat(orderTotal) || 0);
  const overLimit = creditStatus.creditLimit !== null && projected > creditStatus.creditLimit;
  const hasOverdue = overdue !== null && overdue > 0;

  if (!overLimit && !hasOverdue) return null;

  return (
    <Alert variant="warning" className="mb-3">
      <FaExclamationTriangle className="me-2" />
      {overLimit && (
        <div>
          <strong>Balance:</strong> {formatCurrency(projected, currency)}
          {' · '}
          <strong>Limit:</strong> {formatCurrency(creditStatus.creditLimit, currency)}
          {' · '}
          <strong>Over by:</strong> {formatCurrency(projected - creditStatus.creditLimit, currency)}
        </div>
      )}
      {hasOverdue && (
        <div>
          <strong>Overdue:</strong> {formatCurrency(overdue, currency)}
        </div>
      )}
    </Alert>
  );
};

export default CreditWarningAlert;
