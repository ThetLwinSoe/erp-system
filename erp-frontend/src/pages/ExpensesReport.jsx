import { useState, useEffect } from 'react';
import { Card, Table, Button, Form, Spinner, Alert, Row, Col, Badge } from 'react-bootstrap';
import { FaFileExport, FaSearch, FaFileInvoiceDollar } from 'react-icons/fa';
import { reportsAPI, companiesAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { fetchAllPages } from '../utils/fetchAll';
import { formatCurrency } from '../utils/currency';
import { extractApiError } from '../utils/errorUtils';
import ErrorAlert from '../components/common/ErrorAlert';
import { EXPENSE_CATEGORIES } from '../utils/constants';

const ExpensesReport = () => {
  const { user, isSuperAdmin, canAccessExpenseTracker } = useAuth();
  const hasAccess = canAccessExpenseTracker();

  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [users, setUsers] = useState([]);
  const [companies, setCompanies] = useState([]);

  const [filters, setFilters] = useState({ startDate: '', endDate: '', category: '', userId: '', companyId: '' });

  useEffect(() => {
    if (isSuperAdmin()) {
      fetchAllPages(companiesAPI.getAll)
        .then((companiesData) => setCompanies(companiesData))
        .catch(() => setCompanies([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recorded-by dropdown is scoped to whichever company is selected
  // (superadmin) or the caller's own company - mirrors the "Created By"
  // filter on NotBuyingCustomersReport. Switching companies invalidates any
  // previously chosen user.
  useEffect(() => {
    if (!hasAccess) return;
    if (isSuperAdmin() && !filters.companyId) {
      setUsers([]);
      return;
    }
    const params = isSuperAdmin() && filters.companyId ? { companyId: filters.companyId } : {};
    reportsAPI.getReportUsers(params)
      .then((response) => setUsers(response.data.data || []))
      .catch(() => setUsers([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.companyId, hasAccess]);

  const selectedCompany = isSuperAdmin()
    ? companies.find((c) => String(c.id) === String(filters.companyId))
    : user?.company;
  const currency = selectedCompany?.currency || 'USD';
  const canGenerate = hasAccess && (!isSuperAdmin() || !!filters.companyId) && !!filters.startDate && !!filters.endDate;

  const buildParams = () => {
    const params = { startDate: filters.startDate, endDate: filters.endDate };
    if (filters.category) params.category = filters.category;
    if (filters.userId) params.userId = filters.userId;
    if (isSuperAdmin() && filters.companyId) params.companyId = filters.companyId;
    return params;
  };

  const fetchReport = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await reportsAPI.getExpensesReport(buildParams());
      setSummary(response.data.data.summary || null);
      setExpenses(response.data.data.expenses || []);
    } catch (err) {
      setError(extractApiError(err, 'Failed to fetch report'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    fetchReport();
  };

  const handleExportCSV = async () => {
    try {
      setExporting(true);
      const response = await reportsAPI.exportExpensesCSV(buildParams());

      const bom = String.fromCharCode(0xFEFF);
      const blob = new Blob([bom + response.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `expenses-report-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(extractApiError(err, 'Failed to export report'));
    } finally {
      setExporting(false);
    }
  };

  const formatAmount = (value) => formatCurrency(value, currency);

  if (!hasAccess) {
    return (
      <div>
        <h2>
          <FaFileInvoiceDollar className="me-2" />
          Expenses Report
        </h2>
        <Alert variant="info" className="mt-3">
          {isSuperAdmin() ? 'Select a company to generate this report.' : 'Expense Tracker is not available to your account.'}
        </Alert>
      </div>
    );
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>
          <FaFileInvoiceDollar className="me-2" />
          Expenses Report
          {isSuperAdmin() && summary && selectedCompany && (
            <small className="text-muted ms-2">— {selectedCompany.name}</small>
          )}
        </h2>
        {summary && (
          <Button variant="success" onClick={handleExportCSV} disabled={exporting || !canGenerate}>
            <FaFileExport className="me-2" />
            {exporting ? 'Exporting...' : 'Export to CSV'}
          </Button>
        )}
      </div>

      <ErrorAlert error={error} dismissible onClose={() => setError(null)} />

      {/* Filters */}
      <Card className="mb-4">
        <Card.Header>Filters</Card.Header>
        <Card.Body>
          <Form onSubmit={handleSubmit}>
            <Row className="g-3">
              {isSuperAdmin() && (
                <Col md={3}>
                  <Form.Group>
                    <Form.Label>Company *</Form.Label>
                    <Form.Select
                      value={filters.companyId}
                      onChange={(e) => setFilters({ ...filters, companyId: e.target.value, userId: '' })}
                    >
                      <option value="">Select a company...</option>
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </Col>
              )}
              <Col md={3}>
                <Form.Group>
                  <Form.Label>Start Date</Form.Label>
                  <Form.Control
                    type="date"
                    required
                    value={filters.startDate}
                    onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                  />
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group>
                  <Form.Label>End Date</Form.Label>
                  <Form.Control
                    type="date"
                    required
                    value={filters.endDate}
                    onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                  />
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group>
                  <Form.Label>Category</Form.Label>
                  <Form.Select
                    value={filters.category}
                    onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                  >
                    <option value="">All Categories</option>
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group>
                  <Form.Label>Recorded By</Form.Label>
                  <Form.Select
                    value={filters.userId}
                    onChange={(e) => setFilters({ ...filters, userId: e.target.value })}
                  >
                    <option value="">All Users</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>
            <div className="mt-3">
              <Button variant="primary" type="submit" disabled={loading || !canGenerate}>
                <FaSearch className="me-2" />
                {loading ? 'Loading...' : 'Generate Report'}
              </Button>
              {!canGenerate && (
                <small className="text-muted ms-2">
                  {isSuperAdmin() && !filters.companyId
                    ? 'Select a company, start date, and end date to generate this report.'
                    : 'Select a start and end date to generate this report.'}
                </small>
              )}
            </div>
          </Form>
        </Card.Body>
      </Card>

      {/* Summary */}
      {summary && (
        <Row className="g-3 mb-3">
          <Col md={4}>
            <Card className="text-center h-100">
              <Card.Body>
                <h6 className="text-muted">Total Expenses</h6>
                <h3 className="text-danger">{formatAmount(summary.totalAmount)}</h3>
              </Card.Body>
            </Card>
          </Col>
          <Col md={4}>
            <Card className="text-center h-100">
              <Card.Body>
                <h6 className="text-muted">Number of Expenses</h6>
                <h3 className="text-primary">{summary.count}</h3>
              </Card.Body>
            </Card>
          </Col>
          <Col md={4}>
            <Card className="text-center h-100">
              <Card.Body>
                <h6 className="text-muted">Top Category</h6>
                {summary.byCategory.length > 0 ? (
                  <>
                    <h5 className="mb-0">{summary.byCategory[0].category}</h5>
                    <small className="text-muted">{formatAmount(summary.byCategory[0].amount)}</small>
                  </>
                ) : (
                  <h5 className="text-muted mb-0">-</h5>
                )}
              </Card.Body>
            </Card>
          </Col>
        </Row>
      )}

      {/* By category breakdown */}
      {summary && summary.byCategory.length > 0 && (
        <Card className="mb-4">
          <Card.Header>By Category</Card.Header>
          <Card.Body className="p-0">
            <Table striped hover className="mb-0">
              <thead>
                <tr>
                  <th>Category</th>
                  <th className="text-end">Count</th>
                  <th className="text-end">Amount</th>
                </tr>
              </thead>
              <tbody>
                {summary.byCategory.map((c) => (
                  <tr key={c.category}>
                    <td>{c.category}</td>
                    <td className="text-end">{c.count}</td>
                    <td className="text-end">{formatAmount(c.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card.Body>
        </Card>
      )}

      {/* Expense details */}
      {summary && (
        <Card>
          <Card.Header>
            Expense Details {expenses.length > 0 && <Badge bg="primary" className="ms-2">{expenses.length} records</Badge>}
          </Card.Header>
          <Card.Body className="p-0">
            {loading ? (
              <div className="text-center py-4">
                <Spinner animation="border" variant="primary" />
              </div>
            ) : expenses.length === 0 ? (
              <Alert variant="info" className="m-3 mb-0">
                No expenses found for this period.
              </Alert>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <Table striped hover responsive className="mb-0">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Expense #</th>
                      <th>Category</th>
                      <th>Paid To</th>
                      <th>Method</th>
                      <th className="text-end">Amount</th>
                      <th>Recorded By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map((e) => (
                      <tr key={e.id}>
                        <td>{e.expenseDate}</td>
                        <td><code>{e.expenseNumber}</code></td>
                        <td>{e.category}</td>
                        <td>{e.paidTo || '-'}</td>
                        <td>{e.paymentMethod || '-'}</td>
                        <td className="text-end">{formatAmount(e.amount)}</td>
                        <td>{e.user?.name || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </Card.Body>
        </Card>
      )}
    </div>
  );
};

export default ExpensesReport;
