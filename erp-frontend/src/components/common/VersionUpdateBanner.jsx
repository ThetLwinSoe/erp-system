import { useState, useEffect } from 'react';
import { Alert } from 'react-bootstrap';
import { versionAPI } from '../../services/api';
import { APP_VERSION, isNewerVersion } from '../../utils/version';

/**
 * Web-only, dismissible "update available" notice. Checks once per mount
 * (Layout doesn't remount between page navigations, so this naturally only
 * checks once per session) rather than repeating on every page like the
 * subscription banner - an update notice doesn't need repeat-nagging.
 * Never blocks anything, just informs.
 */
const VersionUpdateBanner = () => {
  const [dismissed, setDismissed] = useState(false);
  const [latestVersion, setLatestVersion] = useState(null);

  useEffect(() => {
    versionAPI
      .get()
      .then((res) => setLatestVersion(res.data?.latestWebVersion || null))
      .catch(() => setLatestVersion(null));
  }, []);

  if (dismissed) return null;
  if (!isNewerVersion(latestVersion, APP_VERSION)) return null;

  return (
    <Alert
      variant="info"
      dismissible
      onClose={() => setDismissed(true)}
      className="mb-0 rounded-0"
    >
      A new version is available. Please refresh the page to update.
    </Alert>
  );
};

export default VersionUpdateBanner;
