import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import Sidebar from './Sidebar';
import SubscriptionAlertBanner from '../common/SubscriptionAlertBanner';
import VersionUpdateBanner from '../common/VersionUpdateBanner';
import { versionAPI } from '../../services/api';

const Layout = () => {
  const location = useLocation();
  const [latestVersion, setLatestVersion] = useState(null);

  useEffect(() => {
    versionAPI
      .get()
      .then((res) => setLatestVersion(res.data?.latestWebVersion || null))
      .catch(() => setLatestVersion(null));
  }, []);

  return (
    <div className="d-flex flex-column min-vh-100">
      <Navbar latestVersion={latestVersion} />
      <VersionUpdateBanner latestVersion={latestVersion} />
      <SubscriptionAlertBanner key={location.pathname} />
      <div className="d-flex flex-grow-1" style={{ overflow: 'hidden' }}>
        <Sidebar />
        <main className="flex-grow-1 p-4 bg-light" style={{ minWidth: 0, overflow: 'auto' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
