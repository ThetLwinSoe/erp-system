import { useState, useEffect } from 'react';
import { Card, Table, Button, Form, Spinner, Alert, Row, Col, Badge } from 'react-bootstrap';
import { FaFileExport, FaSearch, FaChartBar } from 'react-icons/fa';
import { reportsAPI, customersAPI } from '../services/api';
import StatusBadge from '../components/common/StatusBadge';
import { ORDER_STATUS } from '../utils/constants';

const SalesReport = () => {
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [sales, setSales] = useState([]);
  const [summary, setSummary] = useState(null);
  const [customers, setCustomers] = useState([]);

  // Filter state
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    customerId: '',
    status: '',
  });

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      const response = await customersAPI.getAll({ limit: 100, type: 'customer' });
      setCustomers(response.data.data || []);
    } catch (err) {
      console.error('Error fetching customers:', err);
    }
  };

  const fetchReport = async () => {
    try {
      setLoading(true);
      setError('');

      const params = {};
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      if (filters.customerId) params.customerId = filters.customerId;
      if (filters.status) params.status = filters.status;

      const response = await reportsAPI.getSalesReport(params);
      setSales(response.data.data.sales || []);
      setSummary(response.data.data.summary || null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch report');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      setExporting(true);

      const params = {};
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      if (filters.customerId) params.customerId = filters.customerId;
      if (filters.status) params.status = filters.status;

      const response = await reportsAPI.exportSalesCSV(params);

      // Create download link
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `sales-report-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
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

  const formatCurrency = (value) => {
    return `$${parseFloat(value).toFixed(2)}`;
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>
          <FaChartBar className="me-2" />
          Sales Report
        </h2>
        {sales.length > 0 && (
          <Button variant="success" onClick={handleExport} disabled={exporting}>
            <FaFileExport className="me-2" />
            {exporting ? 'Exporting...' : 'Export to CSV'}
          </Button>
        )}
      </div>

      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}

      {/* Filters */}
      <Card className="mb-4">
        <Card.Header>Filters</Card.Header>
        <Card.Body>
          <Form onSubmit={handleSubmit}>
            <Row className="g-3">
              <Col md={3}>
                <Form.Group>
                  <Form.Label>Start Date</Form.Label>
                  <Form.Control
                    type="date"
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
                    value={filters.endDate}
                    onChange={(e) => handleFilterChange('endDate', e.target.value)}
                  />
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group>
                  <Form.Label>Customer</Form.Label>
                  <Form.Select
                    value={filters.customerId}
                    onChange={(e) => handleFilterChange('customerId', e.target.value)}
                  >
                    <option value="">All Customers</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group>
                  <Form.Label>Status</Form.Label>
                  <Form.Select
                    value={filters.status}
                    onChange={(e) => handleFilterChange('status', e.target.value)}
                  >
                    <option value="">All Statuses</option>
                    {Object.values(ORDER_STATUS).map((status) => (
                      <option key={status} value={status} className="text-capitalize">
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>
            <div className="mt-3">
              <Button variant="primary" type="submit" disabled={loading}>
                <FaSearch className="me-2" />
                {loading ? 'Loading...' : 'Generate Report'}
              </Button>
            </div>
          </Form>
        </Card.Body>
      </Card>

      {/* Summary Cards */}
      {summary && (
        <Row className="g-4 mb-4">
          <Col md={3}>
            <Card className="text-center h-100">
              <Card.Body>
                <h6 className="text-muted">Total Orders</h6>
                <h2 className="text-primary">{summary.totalOrders}</h2>
              </Card.Body>
            </Card>
          </Col>
          <Col md={3}>
            <Card className="text-center h-100">
              <Card.Body>
                <h6 className="text-muted">Total Revenue</h6>
                <h2 className="text-success">{formatCurrency(summary.totalRevenue)}</h2>
              </Card.Body>
            </Card>
          </Col>
          <Col md={3}>
            <Card className="text-center h-100">
              <Card.Body>
                <h6 className="text-muted">Total Tax</h6>
                <h2 className="text-info">{formatCurrency(summary.totalTax)}</h2>
              </Card.Body>
            </Card>
          </Col>
          <Col md={3}>
            <Card className="text-center h-100">
              <Card.Body>
                <h6 className="text-muted">By Status</h6>
                <div className="d-flex flex-wrap justify-content-center gap-1 mt-2">
                  {Object.entries(summary.byStatus).map(([status, data]) => (
                    <Badge key={status} bg="secondary" className="me-1">
                      {status}: {data.count}
                    </Badge>
                  ))}
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      )}

      {/* Results Table */}
      <Card>
        <Card.Header>
          Sales Data {sales.length > 0 && <Badge bg="primary" className="ms-2">{sales.length} records</Badge>}
        </Card.Header>
        <Card.Body>
          {loading ? (
            <div className="text-center py-4">
              <Spinner animation="border" variant="primary" />
            </div>
          ) : sales.length === 0 ? (
            <Alert variant="info">
              No sales data found. Use the filters above and click "Generate Report" to view sales data.
            </Alert>
          ) : (
            <Table striped hover responsive>
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Date</th>
                  <th>Customer ID</th>
                  <th>Customer</th>
                  <th>Item SKU</th>
                  <th>Item Name</th>
                  <th className="text-end">Qty</th>
                  <th>Status</th>
                  <th className="text-end">Subtotal</th>
                  <th className="text-end">Tax</th>
                  <th className="text-end">Total</th>
                </tr>
              </thead>
              <tbody>
                {sales.flatMap((sale) =>
                  sale.items && sale.items.length > 0
                    ? sale.items.map((item, idx) => (
                        <tr key={`${sale.id}-${idx}`}>
                          <td><code>{sale.orderNumber}</code></td>
                          <td>{new Date(sale.createdAt).toLocaleDateString()}</td>
                          <td><code>{sale.customer?.id || '-'}</code></td>
                          <td>{sale.customer?.name || '-'}</td>
                          <td><code>{item.product?.sku || '-'}</code></td>
                          <td>{item.product?.name || '-'}</td>
                          <td className="text-end">{item.quantity}</td>
                          <td><StatusBadge status={sale.status} /></td>
                          <td className="text-end">{formatCurrency(sale.subtotal)}</td>
                          <td className="text-end">{formatCurrency(sale.tax)}</td>
                          <td className="text-end fw-bold">{formatCurrency(sale.total)}</td>
                        </tr>
                      ))
                    : [
                        <tr key={sale.id}>
                          <td><code>{sale.orderNumber}</code></td>
                          <td>{new Date(sale.createdAt).toLocaleDateString()}</td>
                          <td><code>{sale.customer?.id || '-'}</code></td>
                          <td>{sale.customer?.name || '-'}</td>
                          <td>-</td>
                          <td>-</td>
                          <td className="text-end">-</td>
                          <td><StatusBadge status={sale.status} /></td>
                          <td className="text-end">{formatCurrency(sale.subtotal)}</td>
                          <td className="text-end">{formatCurrency(sale.tax)}</td>
                          <td className="text-end fw-bold">{formatCurrency(sale.total)}</td>
                        </tr>
                      ]
                )}
              </tbody>
              <tfoot>
                <tr className="table-dark">
                  <td colSpan="8" className="text-end fw-bold">Totals:</td>
                  <td className="text-end fw-bold">
                    {formatCurrency(sales.reduce((sum, s) => sum + parseFloat(s.subtotal), 0))}
                  </td>
                  <td className="text-end fw-bold">
                    {formatCurrency(sales.reduce((sum, s) => sum + parseFloat(s.tax), 0))}
                  </td>
                  <td className="text-end fw-bold">
                    {formatCurrency(sales.reduce((sum, s) => sum + parseFloat(s.total), 0))}
                  </td>
                </tr>
              </tfoot>
            </Table>
          )}
        </Card.Body>
      </Card>
    </div>
  );
};

export default SalesReport;
