/**
 * Nets a sale/purchase order's total against its completed returns and
 * payments. Shared by SaleDetails.jsx and PurchaseDetails.jsx so the two
 * can't silently drift apart.
 *
 * Both netAmountDue and balanceDue are floored at 0 rather than going
 * negative - if an order was paid in full and then returned, a refund may
 * be owed, but this app doesn't track refund payouts, so that's surfaced as
 * "fully settled" (fullySettledByReturn) rather than a misleading negative
 * balance.
 * @param {number|string} total - The order's original total
 * @param {number} returnedAmount - Sum of the order's completed returns
 * @param {number} totalPaid - Sum of the order's recorded payments
 * @returns {{ netAmountDue: number, balanceDue: number, fullySettledByReturn: boolean }}
 */
export const computeOrderBalance = (total, returnedAmount, totalPaid) => {
  const netAmountDue = Math.max(0, parseFloat(total || 0) - returnedAmount);
  const balanceDue = Math.max(0, netAmountDue - totalPaid);
  const fullySettledByReturn = returnedAmount > 0 && netAmountDue - totalPaid <= 0;
  return { netAmountDue, balanceDue, fullySettledByReturn };
};
