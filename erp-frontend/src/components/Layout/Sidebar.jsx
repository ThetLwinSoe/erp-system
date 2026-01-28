import { Nav } from 'react-bootstrap';
import { NavLink } from 'react-router-dom';
import {
  FaTachometerAlt,
  FaUsers,
  FaAddressBook,
  FaBoxes,
  FaWarehouse,
  FaShoppingCart,
  FaTruck,
} from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';

const Sidebar = () => {
  const { isAdmin } = useAuth();

  const menuItems = [
    { path: '/', icon: FaTachometerAlt, label: 'Dashboard' },
    { path: '/users', icon: FaUsers, label: 'Users', adminOnly: true },
    { path: '/customers', icon: FaAddressBook, label: 'Customers' },
    { path: '/products', icon: FaBoxes, label: 'Products' },
    { path: '/inventory', icon: FaWarehouse, label: 'Inventory' },
    { path: '/sales', icon: FaShoppingCart, label: 'Sales' },
    { path: '/purchases', icon: FaTruck, label: 'Purchases' },
  ];

  return (
    <div className="sidebar bg-light border-end" style={{ width: '250px', minHeight: '100vh' }}>
      <Nav className="flex-column p-3">
        {menuItems.map((item) => {
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
      </Nav>
    </div>
  );
};

export default Sidebar;
