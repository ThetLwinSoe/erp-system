import { CURRENCY_SYMBOLS } from './constants';

/**
 * Format a number as currency with the appropriate symbol
 * @param {number|string} amount - The amount to format
 * @param {string} currency - The currency code (USD, SGD, THB, MMK)
 * @returns {string} Formatted currency string
 */
export const formatCurrency = (amount, currency = 'USD') => {
  const numAmount = parseFloat(amount || 0);
  const symbol = CURRENCY_SYMBOLS[currency] || '$';
  const formatted = numAmount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${symbol}${formatted}`;
};

/**
 * Get currency symbol for a given currency code
 * @param {string} currency - The currency code
 * @returns {string} Currency symbol
 */
export const getCurrencySymbol = (currency = 'USD') => {
  return CURRENCY_SYMBOLS[currency] || '$';
};
