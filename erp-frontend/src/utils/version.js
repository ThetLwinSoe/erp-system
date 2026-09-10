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

// The last LATEST_WEB_VERSION this browser has acknowledged, so the update
// banner only nags about versions the user hasn't already dismissed - and
// stays dismissed across refreshes, unlike component state. Wrapped in
// try/catch since localStorage can throw (private browsing, storage disabled).
const LAST_SEEN_KEY = 'lastSeenAppVersion';

export const getLastSeenVersion = () => {
  try {
    return localStorage.getItem(LAST_SEEN_KEY);
  } catch {
    return null;
  }
};

export const setLastSeenVersion = (version) => {
  if (!version) return;
  try {
    localStorage.setItem(LAST_SEEN_KEY, version);
  } catch {
    // ignore - nothing we can do if storage is unavailable
  }
};
