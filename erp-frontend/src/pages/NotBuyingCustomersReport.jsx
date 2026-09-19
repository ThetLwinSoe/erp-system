import { useState, useEffect } from 'react';
import { Card, Table, Button, Form, Spinner, Alert, Row, Col, Badge } from 'react-bootstrap';
import { FaFileExport, FaSearch, FaUserSlash } from 'react-icons/fa';
import { reportsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { extractApiError } from '../utils/errorUtils';
import ErrorAlert from '../components/common/ErrorAlert';

const NotBuyingCustomersReport = () => {
  const { isSaleRep } = useAuth();
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [summary, setSummary] = useState(null);
  const [users, setUsers] = useState([]);

  const [filters, setFilters] = useState({ startDate: '', endDate: '', userId: '' });

  // Sale Rep is always scoped to their own sales server-side regardless of
  // this filter, so there's nothing useful for them to pick here - and the
  // backend endpoint that lists users blocks that role outright anyway.
  useEffect(() => {
    if (isSaleRep()) return;
    reportsAPI.getReportUsers()
      .then((response) => setUsers(response.data.data || []))
      .catch(() => setUsers([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchReport = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await reportsAPI.getNotBuyingCustomersReport(filters);
      setCustomers(response.data.data.customers || []);
      setSummary(response.data.data.summary || null);
    } catch (err) {
      setError(extractApiError(err, 'Failed to fetch report'));
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      setExporting(true);

      const response = await reportsAPI.exportNotBuyingCustomersCSV(filters);

      // UTF-8 BOM for proper encoding (supports Unicode/Burmese text)
      const blob = new Blob(['﻿' + response.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `not-buying-customers-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch {
      setError('Failed to export report');
    } finally {
      setExporting(false);
    }
  };

  const handleFilterChange = (field, value) => {
    setFilters({ ...filters, [field]: value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    fetchReport();
  };

  const canGenerate = !!filters.startDate && !!filters.endDate;

  const formatDate = (value) => (value ? new Date(value).toLocaleDateString() : 'Never');

  const daysSince = (value) => {
    if (!value) return null;
    return Math.floor((Date.now() - new Date(value)) / (1000 * 60 * 60 * 24));
  };

  return (
    <div style={{ width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
      <div className="d-flex justify-content-between align-items-center mb-4" style={{ width: '100%' }}>
        <h2>
          <FaUserSlash className="me-2" />
          Not Buying Customers
        </h2>
        {customers.length > 0 && (
          <Button variant="success" onClick={handleExport} disabled={exporting || !canGenerate}>
            <FaFileExport className="me-2" />
            {exporting ? 'Exporting...' : 'Export to CSV'}
          </Button>
        )}
      </div>

      <ErrorAlert error={error} dismissible onClose={() => setError(null)} />

      {/* Filters */}
      <Card className="mb-4" style={{ width: '100%', maxWidth: '100%' }}>
        <Card.Header>Filters</Card.Header>
        <Card.Body>
          <Form onSubmit={handleSubmit}>
            <Row className="g-3" style={{ margin: 0 }}>
              <Col md={3}>
                <Form.Group>
                  <Form.Label>Start Date</Form.Label>
                  <Form.Control
                    type="date"
                    required
                    value={filters.startDate}
                    onChange={(e) => handleFilterChange('startDate', e.target.value)}
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
                    onChange={(e) => handleFilterChange('endDate', e.target.value)}
                  />
                </Form.Group>
              </Col>
              {!isSaleRep() && (
                <Col md={3}>
                  <Form.Group>
                    <Form.Label>Created By</Form.Label>
                    <Form.Select
                      value={filters.userId}
                      onChange={(e) => handleFilterChange('userId', e.target.value)}
                    >
                      <option value="">All Users</option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name}
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </Col>
              )}
            </Row>
            <div className="mt-3">
              <Button variant="primary" type="submit" disabled={loading || !canGenerate}>
                <FaSearch className="me-2" />
                {loading ? 'Loading...' : 'Generate Report'}
              </Button>
              {!canGenerate && (
                <small className="text-muted ms-2">Select a start and end date to generate this report.</small>
              )}
            </div>
          </Form>
        </Card.Body>
      </Card>

      {/* Summary Cards */}
      {summary && (
        <div style={{ width: '100%', maxWidth: '100%' }}>
          <Row className="g-3 mb-3" style={{ margin: 0 }}>
            <Col md={4}>
              <Card className="text-center h-100">
                <Card.Body>
                  <h6 className="text-muted">Not Buying</h6>
                  <h2 className="text-danger">{summary.totalNotBuying}</h2>
                  <small className="text-muted">No orders in the selected period</small>
                </Card.Body>
              </Card>
            </Col>
            <Col md={4}>
              <Card className="text-center h-100">
                <Card.Body>
                  <h6 className="text-muted">Active Customers</h6>
                  <h2 className="text-primary">{summary.totalCandidates}</h2>
                  <small className="text-muted">Total considered</small>
                </Card.Body>
              </Card>
            </Col>
            <Col md={4}>
              <Card className="text-center h-100">
                <Card.Body>
                  <h6 className="text-muted">Not Buying Rate</h6>
                  <h2 className="text-warning">
                    {summary.totalCandidates > 0
                      ? `${((summary.totalNotBuying / summary.totalCandidates) * 100).toFixed(1)}%`
                      : '0%'}
                  </h2>
                  <small className="text-muted">Of active customers</small>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </div>
      )}

      {/* Results Table */}
      <Card style={{ width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
        <Card.Header>
          Customers {customers.length > 0 && <Badge bg="primary" className="ms-2">{customers.length} records</Badge>}
        </Card.Header>
        <Card.Body className="p-0" style={{ width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
          {loading ? (
            <div className="text-center py-4">
              <Spinner animation="border" variant="primary" />
            </div>
          ) : customers.length === 0 ? (
            <Alert variant="info" className="m-3">
              {summary
                ? 'No not-buying customers found - every active customer ordered in this period.'
                : 'Select a date range and click "Generate Report" to view not-buying customers.'}
            </Alert>
          ) : (
            <div style={{ width: '100%', overflowX: 'auto' }}>
              <Table striped hover className="mb-0">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Email</th>
                    <th>City</th>
                    <th>Last Order Date</th>
                    <th className="text-end">Days Since</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => (
                    <tr key={customer.id}>
                      <td>{customer.customerCode || '-'}</td>
                      <td>{customer.name}</td>
                      <td>{customer.phone || '-'}</td>
                      <td>{customer.email || '-'}</td>
                      <td>{customer.city || '-'}</td>
                      <td>
                        {customer.lastOrderDate ? formatDate(customer.lastOrderDate) : <Badge bg="secondary">Never</Badge>}
                      </td>
                      <td className="text-end">{daysSince(customer.lastOrderDate) ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </Card.Body>
      </Card>
    </div>
  );
};

export default NotBuyingCustomersReport;
