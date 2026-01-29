import { useState, useEffect } from 'react';
import { Card, Table, Button, Form, Spinner, Alert, Row, Col, Badge } from 'react-bootstrap';
import { FaFileExport, FaSearch, FaChartBar } from 'react-icons/fa';
import { reportsAPI, customersAPI } from '../services/api';
import StatusBadge from '../components/common/StatusBadge';
import { PURCHASE_STATUS } from '../utils/constants';

const PurchasesReport = () => {
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [purchases, setPurchases] = useState([]);
  const [summary, setSummary] = useState(null);
  const [suppliers, setSuppliers] = useState([]);

  // Filter state
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    supplierId: '',
    status: '',
  });

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    try {
      const response = await customersAPI.getAll({ limit: 100, type: 'supplier' });
      setSuppliers(response.data.data || []);
    } catch (err) {
      console.error('Error fetching suppliers:', err);
    }
  };

  const fetchReport = async () => {
    try {
      setLoading(true);
      setError('');

      const params = {};
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      if (filters.supplierId) params.supplierId = filters.supplierId;
      if (filters.status) params.status = filters.status;

      const response = await reportsAPI.getPurchasesReport(params);
      setPurchases(response.data.data.purchases || []);
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
      if (filters.supplierId) params.supplierId = filters.supplierId;
      if (filters.status) params.status = filters.status;

      const response = await reportsAPI.exportPurchasesCSV(params);

      // Create download link
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `purchases-report-${new Date().toISOString().split('T')[0]}.csv`;
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
          Purchases Report
        </h2>
        {purchases.length > 0 && (
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
                  <Form.Label>Supplier</Form.Label>
                  <Form.Select
                    value={filters.supplierId}
                    onChange={(e) => handleFilterChange('supplierId', e.target.value)}
                  >
                    <option value="">All Suppliers</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
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
                    {Object.values(PURCHASE_STATUS).map((status) => (
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
                <h6 className="text-muted">Total Amount</h6>
                <h2 className="text-success">{formatCurrency(summary.totalAmount)}</h2>
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
          Purchases Data {purchases.length > 0 && <Badge bg="primary" className="ms-2">{purchases.length} records</Badge>}
        </Card.Header>
        <Card.Body>
          {loading ? (
            <div className="text-center py-4">
              <Spinner animation="border" variant="primary" />
            </div>
          ) : purchases.length === 0 ? (
            <Alert variant="info">
              No purchases data found. Use the filters above and click "Generate Report" to view purchases data.
            </Alert>
          ) : (
            <Table striped hover responsive>
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Date</th>
                  <th>Supplier ID</th>
                  <th>Supplier</th>
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
                {purchases.flatMap((purchase) =>
                  purchase.items && purchase.items.length > 0
                    ? purchase.items.map((item, idx) => (
                        <tr key={`${purchase.id}-${idx}`}>
                          <td><code>{purchase.orderNumber}</code></td>
                          <td>{new Date(purchase.createdAt).toLocaleDateString()}</td>
                          <td><code>{purchase.supplier?.id || '-'}</code></td>
                          <td>{purchase.supplier?.name || '-'}</td>
                          <td><code>{item.product?.sku || '-'}</code></td>
                          <td>{item.product?.name || '-'}</td>
                          <td className="text-end">{item.quantity}</td>
                          <td><StatusBadge status={purchase.status} /></td>
                          <td className="text-end">{formatCurrency(purchase.subtotal)}</td>
                          <td className="text-end">{formatCurrency(purchase.tax)}</td>
                          <td className="text-end fw-bold">{formatCurrency(purchase.total)}</td>
                        </tr>
                      ))
                    : [
                        <tr key={purchase.id}>
                          <td><code>{purchase.orderNumber}</code></td>
                          <td>{new Date(purchase.createdAt).toLocaleDateString()}</td>
                          <td><code>{purchase.supplier?.id || '-'}</code></td>
                          <td>{purchase.supplier?.name || '-'}</td>
                          <td>-</td>
                          <td>-</td>
                          <td className="text-end">-</td>
                          <td><StatusBadge status={purchase.status} /></td>
                          <td className="text-end">{formatCurrency(purchase.subtotal)}</td>
                          <td className="text-end">{formatCurrency(purchase.tax)}</td>
                          <td className="text-end fw-bold">{formatCurrency(purchase.total)}</td>
                        </tr>
                      ]
                )}
              </tbody>
              <tfoot>
                <tr className="table-dark">
                  <td colSpan="8" className="text-end fw-bold">Totals:</td>
                  <td className="text-end fw-bold">
                    {formatCurrency(purchases.reduce((sum, p) => sum + parseFloat(p.subtotal), 0))}
                  </td>
                  <td className="text-end fw-bold">
                    {formatCurrency(purchases.reduce((sum, p) => sum + parseFloat(p.tax), 0))}
                  </td>
                  <td className="text-end fw-bold">
                    {formatCurrency(purchases.reduce((sum, p) => sum + parseFloat(p.total), 0))}
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

export default PurchasesReport;
