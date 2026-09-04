// Bump by hand on each web release (mirrors AppConstants.appVersion on mobile).
export const APP_VERSION = '1.0.0';

/**
 * True if `latest` is a newer version than `current`. Compares dot-separated
 * numeric segments (e.g. "1.10.0" > "1.9.5"); non-numeric segments compare
 * as 0 to fail safe rather than throw.
 */
export const isNewerVersion = (latest, current) => {
  if (!latest || !current) return false;

  const a = latest.split('.').map((n) => parseInt(n, 10) || 0);
  const b = current.split('.').map((n) => parseInt(n, 10) || 0);

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
};
