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

/**
 * Format a number as currency for the invoice/purchase order PDF. MMK has no
 * sub-unit in everyday use, so it's shown as a plain rounded number with no
 * symbol - every other currency renders exactly like formatCurrency().
 * @param {number|string} amount - The amount to format
 * @param {string} currency - The currency code (USD, SGD, THB, MMK)
 * @returns {string} Formatted currency string
 */
export const formatCurrencyForPDF = (amount, currency = 'USD') => {
  if (currency === 'MMK') {
    const numAmount = parseFloat(amount || 0);
    return numAmount.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }
  return formatCurrency(amount, currency);
};
