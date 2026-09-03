/**
 * Days remaining until a DATEONLY string ('YYYY-MM-DD') from the backend.
 * Negative means already past. Parses/compares using local date parts (not
 * UTC) to avoid off-by-one-day shifts from timezone conversion.
 */
export const getDaysRemaining = (dateStr) => {
  if (!dateStr) return null;

  const [y, m, d] = dateStr.split('-').map(Number);
  const endDate = new Date(y, m - 1, d);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.round((endDate - today) / (1000 * 60 * 60 * 24));
};
