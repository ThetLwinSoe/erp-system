import { useState, useEffect } from 'react';
import { Alert, Button } from 'react-bootstrap';
import { isNewerVersion, getLastSeenVersion, setLastSeenVersion } from '../../utils/version';

/**
 * Web-only "update available" notice with two ways to clear it: "Refresh now"
 * (primary - reloads the page and records the version together, so the two
 * can't drift apart) or the "x" (a "stop nagging me" escape hatch that
 * acknowledges without reloading). `latestVersion` is fetched once per app
 * load by Layout (not remounted between page navigations, so this naturally
 * only checks once per session) and passed down here.
 *
 * Compares it against the last version this browser acknowledged
 * (localStorage, not component state) rather than a hardcoded build
 * constant - so there's nothing to hand-bump on release. A browser with no
 * recorded version yet (first-ever visit, or right after this comparison
 * scheme shipped) just silently records the current version instead of
 * showing a false "new version" notice. Never blocks anything, just informs.
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

  // Primary action: couples "acknowledge this version" with actually getting
  // the new code, so the two can't drift apart - dismissing alone would let
  // a user follow the "please refresh" instruction and still see this again.
  const handleRefresh = () => {
    setLastSeenVersion(latestVersion);
    window.location.reload();
  };

  // Secondary "stop nagging me" escape hatch - acknowledges without reloading.
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
      <div className="d-flex justify-content-between align-items-center">
        <span>A new version is available.</span>
        <Button size="sm" variant="outline-primary" className="ms-3 me-3" onClick={handleRefresh}>
          Refresh now
        </Button>
      </div>
    </Alert>
  );
};

export default VersionUpdateBanner;
