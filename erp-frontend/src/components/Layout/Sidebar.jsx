import { useState } from 'react';
import { Nav, Collapse } from 'react-bootstrap';
import { NavLink, useLocation } from 'react-router-dom';
import {
  FaTachometerAlt,
  FaUsers,
  FaAddressBook,
  FaBoxes,
  FaWarehouse,
  FaShoppingCart,
  FaUndo,
  FaTruck,
  FaChartBar,
  FaChevronDown,
  FaChevronRight,
  FaBuilding,
} from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';

const Sidebar = () => {
  const { isAdmin, isSuperAdmin } = useAuth();
  const location = useLocation();
  const [reportsOpen, setReportsOpen] = useState(location.pathname.startsWith('/reports'));

  const menuItems = [
    { path: '/', icon: FaTachometerAlt, label: 'Dashboard' },
    { path: '/companies', icon: FaBuilding, label: 'Companies', superAdminOnly: true },
    { path: '/users', icon: FaUsers, label: 'Users', adminOnly: true },
    { path: '/customers', icon: FaAddressBook, label: 'Customers' },
    { path: '/products', icon: FaBoxes, label: 'Products' },
    { path: '/inventory', icon: FaWarehouse, label: 'Inventory' },
    { path: '/sales', icon: FaShoppingCart, label: 'Sales' },
    { path: '/sales-returns', icon: FaUndo, label: 'Sales Returns' },
    { path: '/purchases', icon: FaTruck, label: 'Purchases' },
  ];

  const reportItems = [
    { path: '/reports/sales', label: 'Sales Report' },
    { path: '/reports/purchases', label: 'Purchases Report' },
  ];

  return (
    <div className="sidebar bg-light border-end" style={{ width: '250px', minHeight: '100vh' }}>
      <Nav className="flex-column p-3">
        {menuItems.map((item) => {
          if (item.superAdminOnly && !isSuperAdmin()) return null;
          if (item.adminOnly && !isAdmin()) return null;

          return (
            <Nav.Link
              key={item.path}
              as={NavLink}
              to={item.path}
              className="d-flex align-items-center py-2 text-dark"
              style={({ isActive }) => ({
                backgroundColor: isActive ? '#e9ecef' : 'transparent',
                borderRadius: '5px',
              })}
            >
              <item.icon className="me-3" />
              {item.label}
            </Nav.Link>
          );
        })}

        {/* Reports Submenu */}
        <Nav.Link
          className="d-flex align-items-center justify-content-between py-2 text-dark"
          onClick={() => setReportsOpen(!reportsOpen)}
          style={{
            backgroundColor: location.pathname.startsWith('/reports') ? '#e9ecef' : 'transparent',
            borderRadius: '5px',
            cursor: 'pointer',
          }}
        >
          <span className="d-flex align-items-center">
            <FaChartBar className="me-3" />
            Reports
          </span>
          {reportsOpen ? <FaChevronDown size={12} /> : <FaChevronRight size={12} />}
        </Nav.Link>
        <Collapse in={reportsOpen}>
          <div>
            {reportItems.map((item) => (
              <Nav.Link
                key={item.path}
                as={NavLink}
                to={item.path}
                className="d-flex align-items-center py-2 text-dark ps-4"
                style={({ isActive }) => ({
                  backgroundColor: isActive ? '#e9ecef' : 'transparent',
                  borderRadius: '5px',
                })}
              >
                {item.label}
              </Nav.Link>
            ))}
          </div>
        </Collapse>
      </Nav>
    </div>
  );
};

export default Sidebar;
