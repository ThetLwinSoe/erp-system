import { formatCurrency } from './currency';

// Local calendar date as YYYY-MM-DD (toISOString would give the UTC date).
export const todayLocal = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
};

// Suggestions for the Method field. Free text is still allowed.
export const PAYMENT_METHOD_OPTIONS = ['Cash', 'Bank transfer', 'Mobile wallet', 'Cheque', 'Card'];

// Returns the message for an amount that can't be saved, or '' when it's fine.
// `max` is the balance the amount may not exceed.
export const amountError = (amount, max, currency) => {
  const n = parseFloat(amount);
  if (amount === '' || Number.isNaN(n) || n <= 0) return 'Enter an amount greater than 0.';
  if (max !== undefined && n > max + 0.005) {
    return `Amount is more than the balance due (${formatCurrency(max, currency)}).`;
  }
  return '';
};
