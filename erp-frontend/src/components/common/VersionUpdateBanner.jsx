import { useState, useEffect } from 'react';
import { Alert } from 'react-bootstrap';
import { isNewerVersion, getLastSeenVersion, setLastSeenVersion } from '../../utils/version';

/**
 * Web-only, dismissible "update available" notice. `latestVersion` is fetched
 * once per app load by Layout (not remounted between page navigations, so
 * this naturally only checks once per session) and passed down here.
 *
 * Compares it against the last version this browser acknowledged
 * (localStorage, not component state) rather than a hardcoded build
 * constant - so there's nothing to hand-bump on release, and dismissing
 * actually stays dismissed across a refresh. A browser with no recorded
 * version yet (first-ever visit, or right after this comparison scheme
 * shipped) just silently records the current version instead of showing
 * a false "new version" notice. Never blocks anything, just informs.
 */
const VersionUpdateBanner = ({ latestVersion }) => {
  const [dismissed, setDismissed] = useState(false);

  // Side effect (writing external storage), not derived state - belongs in
  // an effect. Only ever writes for a browser that has never recorded a
  // version before; never overwrites an existing recorded value.
  useEffect(() => {
    if (latestVersion && getLastSeenVersion() === null) {
      setLastSeenVersion(latestVersion);
    }
  }, [latestVersion]);

  const lastSeen = getLastSeenVersion();
  const shouldShow = !dismissed && lastSeen !== null && isNewerVersion(latestVersion, lastSeen);

  const handleClose = () => {
    setDismissed(true);
    setLastSeenVersion(latestVersion);
  };

  if (!shouldShow) return null;

  return (
    <Alert
      variant="info"
      dismissible
      onClose={handleClose}
      className="mb-0 rounded-0"
    >
      A new version is available. Please refresh the page to update.
    </Alert>
  );
};

export default VersionUpdateBanner;
