import { Outlet, useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import Sidebar from './Sidebar';
import SubscriptionAlertBanner from '../common/SubscriptionAlertBanner';

const Layout = () => {
  const location = useLocation();

  return (
    <div className="d-flex flex-column min-vh-100">
      <Navbar />
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
