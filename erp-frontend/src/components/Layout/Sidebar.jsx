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
  FaClipboardList,
  FaMoneyBillWave,
  FaFileInvoiceDollar,
  FaCalculator,
} from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';

const Sidebar = () => {
  const { isAdmin, isSuperAdmin, canAccessInventory, canAccessPurchases, canAccessSalesReturns, canAccessCreditControl, canAccessExpenseTracker } = useAuth();
  const location = useLocation();
  const isSalesSection = location.pathname.startsWith('/sales') || location.pathname.startsWith('/customers');
  const isPurchasesSection = location.pathname.startsWith('/purchase') || location.pathname.startsWith('/suppliers');
  const isAccountingSection = location.pathname.startsWith('/payments') || location.pathname.startsWith('/expenses');
  const [adjustmentOpen, setAdjustmentOpen] = useState(
    location.pathname.startsWith('/inventory')
  );
  const [salesOpen, setSalesOpen] = useState(isSalesSection);
  const [purchasesOpen, setPurchasesOpen] = useState(isPurchasesSection);
  const [accountingOpen, setAccountingOpen] = useState(isAccountingSection);
  const [reportsOpen, setReportsOpen] = useState(location.pathname.startsWith('/reports'));

  const menuItems = [
    { path: '/', icon: FaTachometerAlt, label: 'Dashboard' },
    { path: '/companies', icon: FaBuilding, label: 'Companies', superAdminOnly: true },
    { path: '/users', icon: FaUsers, label: 'Users', adminOnly: true },
    { path: '/products', icon: FaBoxes, label: 'Products' },
  ];

  const adjustmentItems = [
    { path: '/inventory', label: 'Inventory', icon: FaWarehouse },
    { path: '/inventory-adjustments', label: 'Inv. Adjustments', icon: FaClipboardList },
  ];

  const salesItems = [
    { path: '/customers', label: 'Customers', icon: FaAddressBook },
    { path: '/sales', label: 'Sales Orders', icon: FaShoppingCart },
    { path: '/sales-returns', label: 'Sales Returns', icon: FaUndo, requiresSalesReturns: true },
  ];

  const purchasesItems = [
    { path: '/suppliers', label: 'Suppliers', icon: FaAddressBook },
    { path: '/purchases', label: 'Purchase Orders', icon: FaTruck },
    { path: '/purchase-returns', label: 'Purchase Returns', icon: FaUndo },
  ];

  // Accounting holds the money-movement records. Each item is shown only when the
  // user has access to its feature; the whole section hides when none are visible.
  const accountingItems = [
    { path: '/payments', label: 'Payments', icon: FaMoneyBillWave, visible: () => canAccessCreditControl() },
    { path: '/expenses', label: 'Expenses', icon: FaFileInvoiceDollar, visible: () => canAccessExpenseTracker() },
  ];

  const reportItems = [
    { path: '/reports/sales', label: 'Sales Report' },
    { path: '/reports/not-buying-customers', label: 'Not Buying Customers' },
    { path: '/reports/purchases', label: 'Purchases Report', requiresPurchases: true },
    { path: '/reports/profit-loss', label: 'Profit & Loss', requiresPurchases: true },
  ];

  // Filter sales items for sale_rep (no sales returns)
  const filteredSalesItems = salesItems.filter(item => {
    if (item.requiresSalesReturns && !canAccessSalesReturns()) return false;
    return true;
  });

  const filteredAccountingItems = accountingItems.filter((item) => item.visible());
  const showAccounting = filteredAccountingItems.length > 0;

  // Filter report items for sale_rep (no purchases report)
  const filteredReportItems = reportItems.filter(item => {
    if (item.requiresPurchases && !canAccessPurchases()) return false;
    return true;
  });

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

        {/* Inventory Submenu - Hidden for Sale Rep */}
        {canAccessInventory() && (
          <>
            <Nav.Link
              className="d-flex align-items-center justify-content-between py-2 text-dark"
              onClick={() => setAdjustmentOpen(!adjustmentOpen)}
              style={{
                backgroundColor: location.pathname.startsWith('/inventory') ? '#e9ecef' : 'transparent',
                borderRadius: '5px',
                cursor: 'pointer',
              }}
            >
              <span className="d-flex align-items-center">
                <FaWarehouse className="me-3" />
                Inventory
              </span>
              {adjustmentOpen ? <FaChevronDown size={12} /> : <FaChevronRight size={12} />}
            </Nav.Link>
            <Collapse in={adjustmentOpen}>
              <div>
                {adjustmentItems.map((item) => (
                  <Nav.Link
                    key={item.path}
                    as={NavLink}
                    to={item.path}
                    end={item.path === '/inventory'}
                    className="d-flex align-items-center py-2 text-dark ps-4"
                    style={({ isActive }) => ({
                      backgroundColor: isActive ? '#e9ecef' : 'transparent',
                      borderRadius: '5px',
                    })}
                  >
                    <item.icon className="me-2" size={14} />
                    {item.label}
                  </Nav.Link>
                ))}
              </div>
            </Collapse>
          </>
        )}

        {/* Sales Submenu */}
        <Nav.Link
          className="d-flex align-items-center justify-content-between py-2 text-dark"
          onClick={() => setSalesOpen(!salesOpen)}
          style={{
            backgroundColor: isSalesSection ? '#e9ecef' : 'transparent',
            borderRadius: '5px',
            cursor: 'pointer',
          }}
        >
          <span className="d-flex align-items-center">
            <FaShoppingCart className="me-3" />
            Sales
          </span>
          {salesOpen ? <FaChevronDown size={12} /> : <FaChevronRight size={12} />}
        </Nav.Link>
        <Collapse in={salesOpen}>
          <div>
            {filteredSalesItems.map((item) => (
              <Nav.Link
                key={item.path}
                as={NavLink}
                to={item.path}
                end={item.path === '/sales'}
                className="d-flex align-items-center py-2 text-dark ps-4"
                style={({ isActive }) => ({
                  backgroundColor: isActive ? '#e9ecef' : 'transparent',
                  borderRadius: '5px',
                })}
              >
                <item.icon className="me-2" size={14} />
                {item.label}
              </Nav.Link>
            ))}
          </div>
        </Collapse>

        {/* Purchases Submenu - Hidden for Sale Rep */}
        {canAccessPurchases() && (
          <>
            <Nav.Link
              className="d-flex align-items-center justify-content-between py-2 text-dark"
              onClick={() => setPurchasesOpen(!purchasesOpen)}
              style={{
                backgroundColor: isPurchasesSection ? '#e9ecef' : 'transparent',
                borderRadius: '5px',
                cursor: 'pointer',
              }}
            >
              <span className="d-flex align-items-center">
                <FaTruck className="me-3" />
                Purchases
              </span>
              {purchasesOpen ? <FaChevronDown size={12} /> : <FaChevronRight size={12} />}
            </Nav.Link>
            <Collapse in={purchasesOpen}>
              <div>
                {purchasesItems.map((item) => (
                  <Nav.Link
                    key={item.path}
                    as={NavLink}
                    to={item.path}
                    end={item.path === '/purchases'}
                    className="d-flex align-items-center py-2 text-dark ps-4"
                    style={({ isActive }) => ({
                      backgroundColor: isActive ? '#e9ecef' : 'transparent',
                      borderRadius: '5px',
                    })}
                  >
                    <item.icon className="me-2" size={14} />
                    {item.label}
                  </Nav.Link>
                ))}
              </div>
            </Collapse>
          </>
        )}

        {/* Accounting Submenu - hidden when the user has none of its features */}
        {showAccounting && (
          <>
            <Nav.Link
              className="d-flex align-items-center justify-content-between py-2 text-dark"
              onClick={() => setAccountingOpen(!accountingOpen)}
              style={{
                backgroundColor: isAccountingSection ? '#e9ecef' : 'transparent',
                borderRadius: '5px',
                cursor: 'pointer',
              }}
            >
              <span className="d-flex align-items-center">
                <FaCalculator className="me-3" />
                Accounting
              </span>
              {accountingOpen ? <FaChevronDown size={12} /> : <FaChevronRight size={12} />}
            </Nav.Link>
            <Collapse in={accountingOpen}>
              <div>
                {filteredAccountingItems.map((item) => (
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
                    <item.icon className="me-2" size={14} />
                    {item.label}
                  </Nav.Link>
                ))}
              </div>
            </Collapse>
          </>
        )}

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
            {filteredReportItems.map((item) => (
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
