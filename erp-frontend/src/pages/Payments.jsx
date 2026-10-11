import { useState, useEffect } from 'react';
import { Card, Table, Button, Spinner, Form, Badge, Row, Col } from 'react-bootstrap';
import { FaTrash, FaMoneyBillWave } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { paymentsAPI, customersAPI, companiesAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { fetchAllPages } from '../utils/fetchAll';
import Pagination from '../components/common/Pagination';
import ConfirmModal from '../components/common/ConfirmModal';
import { formatCurrency } from '../utils/currency';
import { extractApiError } from '../utils/errorUtils';
import ErrorAlert from '../components/common/ErrorAlert';
import SortableHeader from '../components/common/SortableHeader';

const Payments = () => {
  const { user, isSuperAdmin, canAccessCreditControl } = useAuth();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState('');
  const [filterContacts, setFilterContacts] = useState([]);
  const [directionFilter, setDirectionFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [sortBy, setSortBy] = useState('paymentDate');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [error, setError] = useState(null);

  // Split once per fetch into the two groups the dropdown renders, sorted
  // alphabetically for predictable scanning - a "both"-type contact
  // legitimately belongs in both groups (mirrors how ContactsPage already
  // treats "both" as belonging to both the Customers and Suppliers lists).
  const customerContacts = [...filterContacts]
    .filter((c) => c.type === 'customer' || c.type === 'both')
    .sort((a, b) => a.name.localeCompare(b.name));
  const supplierContacts = [...filterContacts]
    .filter((c) => c.type === 'supplier' || c.type === 'both')
    .sort((a, b) => a.name.localeCompare(b.name));
  const showCustomerGroup = directionFilter !== 'paid';
  const showSupplierGroup = directionFilter !== 'received';

  const selectedCompany = isSuperAdmin()
    ? companies.find((c) => String(c.id) === String(companyId))
    : user?.company;
  const currency = selectedCompany?.currency || 'USD';
  // Superadmin always passes canAccessCreditControl() (see AuthContext) and
  // additionally needs a company picked here, since the backend needs one to
  // resolve which company's settings to check; everyone else just needs
  // access per the normal company-toggle + per-user-flag/admin-role rule.
  const canQuery = canAccessCreditControl() && (!isSuperAdmin() || !!companyId);

  useEffect(() => {
    if (isSuperAdmin()) {
      companiesAPI.getAll({ limit: 100 })
        .then((res) => setCompanies(res.data.data || []))
        .catch(() => setCompanies([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchPayments = async () => {
    if (!canQuery) {
      setPayments([]);
      setPagination({ total: 0, totalPages: 1 });
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const params = { page, limit: 20, sortBy, sortOrder };
      if (directionFilter) params.direction = directionFilter;
      if (customerFilter) params.customerId = customerFilter;
      if (isSuperAdmin() && companyId) params.companyId = companyId;

      const response = await paymentsAPI.getAll(params);
      setPayments(response.data.data || []);
      setPagination(response.data.pagination || { total: 0, totalPages: 1 });
    } catch (err) {
      setError(extractApiError(err, 'Failed to load payments'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, directionFilter, customerFilter, sortBy, sortOrder, companyId]);

  // The filter's customer/supplier dropdown covers both directions at once,
  // unfiltered by type.
  useEffect(() => {
    if (!canQuery) {
      setFilterContacts([]);
      return;
    }
    const params = {};
    if (isSuperAdmin() && companyId) params.companyId = companyId;
    fetchAllPages(customersAPI.getAll, params)
      .then((data) => setFilterContacts(data))
      .catch(() => setFilterContacts([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  // Narrowing Direction can make the currently selected contact invalid
  // (e.g. a supplier picked, then Direction switched to "Received from
  // Customer") - clear it rather than silently filtering by a hidden value.
  const handleDirectionChange = (value) => {
    setDirectionFilter(value);
    setPage(1);
    if (value && customerFilter) {
      const contact = filterContacts.find((c) => String(c.id) === String(customerFilter));
      const stillValid = contact && (
        (value === 'received' && (contact.type === 'customer' || contact.type === 'both')) ||
        (value === 'paid' && (contact.type === 'supplier' || contact.type === 'both'))
      );
      if (!stillValid) setCustomerFilter('');
    }
  };

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortBy(field);
      setSortOrder('ASC');
    }
  };

  const handleDelete = async () => {
    try {
      await paymentsAPI.delete(selectedPayment.id);
      setShowDeleteModal(false);
      fetchPayments();
    } catch (err) {
      setError(extractApiError(err, 'Delete failed'));
    }
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>
          <FaMoneyBillWave className="me-2" />
          Payments
        </h2>
      </div>

      <p className="text-muted">
        Payments are recorded from a Sale or Purchase order's detail page. This is a read-only history of everything recorded so far.
      </p>

      <ErrorAlert error={error} dismissible onClose={() => setError(null)} />

      <Card>
        <Card.Header>
          <Row className="g-3">
            {isSuperAdmin() && (
              <Col md={3}>
                <Form.Select value={companyId} onChange={(e) => { setCompanyId(e.target.value); setPage(1); }}>
                  <option value="">Select a company...</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Form.Select>
              </Col>
            )}
            <Col md={3}>
              <Form.Select value={directionFilter} onChange={(e) => handleDirectionChange(e.target.value)}>
                <option value="">All Directions</option>
                <option value="received">Received from Customer</option>
                <option value="paid">Paid to Supplier</option>
              </Form.Select>
            </Col>
            <Col md={3}>
              <Form.Select value={customerFilter} onChange={(e) => { setCustomerFilter(e.target.value); setPage(1); }}>
                <option value="">All Customers/Suppliers</option>
                {showCustomerGroup && customerContacts.length > 0 && (
                  <optgroup label="Customers">
                    {customerContacts.map((contact) => (
                      <option key={`c-${contact.id}`} value={contact.id}>
                        {contact.customerCode ? `${contact.customerCode} · ` : ''}{contact.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {showSupplierGroup && supplierContacts.length > 0 && (
                  <optgroup label="Suppliers">
                    {supplierContacts.map((contact) => (
                      <option key={`s-${contact.id}`} value={contact.id}>
                        {contact.supplierCode ? `${contact.supplierCode} · ` : ''}{contact.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </Form.Select>
            </Col>
          </Row>
        </Card.Header>
        <Card.Body>
          {!canQuery ? (
            <div className="text-center py-4 text-muted">
              {isSuperAdmin() ? 'Select a company to view its payments.' : "You don't have access to Credit Control."}
            </div>
          ) : loading ? (
            <div className="text-center py-4">
              <Spinner animation="border" variant="primary" />
            </div>
          ) : payments.length === 0 ? (
            <div className="text-center py-4 text-muted">No payments found</div>
          ) : (
            <Table striped hover responsive>
              <thead>
                <tr>
                  <SortableHeader label="Payment #" field="paymentNumber" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Date" field="paymentDate" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Customer/Supplier" field="customer" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Direction" field="direction" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <th>Order #</th>
                  <SortableHeader label="Amount" field="amount" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <th>Method</th>
                  <th>Reference</th>
                  <SortableHeader label="Recorded By" field="user" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  {isSuperAdmin() && (
                    <SortableHeader label="Company" field="company" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  )}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td><code>{payment.paymentNumber}</code></td>
                    <td>{new Date(payment.paymentDate).toLocaleDateString()}</td>
                    <td>{payment.customer?.name || '-'}</td>
                    <td>
                      <Badge bg={payment.direction === 'received' ? 'success' : 'danger'}>
                        {payment.direction === 'received' ? 'Received' : 'Paid'}
                      </Badge>
                    </td>
                    <td>
                      {payment.sale ? (
                        <Link to={`/sales/${payment.sale.id}`}>{payment.sale.orderNumber}</Link>
                      ) : payment.purchase ? (
                        <Link to={`/purchases/${payment.purchase.id}`}>{payment.purchase.orderNumber}</Link>
                      ) : '-'}
                    </td>
                    <td>{formatCurrency(payment.amount, currency)}</td>
                    <td>{payment.method || '-'}</td>
                    <td>{payment.reference || '-'}</td>
                    <td>{payment.user?.name || '-'}</td>
                    {isSuperAdmin() && (
                      <td>
                        {payment.company ? (
                          <Badge bg="info" style={{ whiteSpace: 'normal', maxWidth: '140px' }}>{payment.company.name}</Badge>
                        ) : (
                          <Badge bg="secondary">No Company</Badge>
                        )}
                      </td>
                    )}
                    <td>
                      {isSuperAdmin() && (
                        <Button
                          variant="outline-danger"
                          size="sm"
                          onClick={() => { setError(null); setSelectedPayment(payment); setShowDeleteModal(true); }}
                          title="Delete"
                        >
                          <FaTrash />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
        <Card.Footer className="d-flex justify-content-between align-items-center">
          <span className="text-muted">Total: {pagination.total} payments</span>
          <Pagination currentPage={page} totalPages={pagination.totalPages} onPageChange={setPage} />
        </Card.Footer>
      </Card>

      <ConfirmModal
        show={showDeleteModal}
        onHide={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        title="Delete Payment"
        message={`Are you sure you want to delete this payment of ${selectedPayment ? formatCurrency(selectedPayment.amount, currency) : ''}?`}
        error={error}
      />
    </div>
  );
};

export default Payments;
