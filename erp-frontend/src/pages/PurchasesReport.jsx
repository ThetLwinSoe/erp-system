import { useState, useEffect } from 'react';
import { Card, Table, Button, Form, Spinner, Alert, Row, Col, Badge } from 'react-bootstrap';
import { FaFileExport, FaSearch, FaChartBar } from 'react-icons/fa';
import { reportsAPI, customersAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/common/StatusBadge';
import { PURCHASE_STATUS } from '../utils/constants';
import { formatCurrency } from '../utils/currency';
import { extractApiError } from '../utils/errorUtils';
import ErrorAlert from '../components/common/ErrorAlert';

const PurchasesReport = () => {
  const { user } = useAuth();
  const currency = user?.company?.currency || 'USD';
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);
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
      setError(null);

      const params = {};
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      if (filters.supplierId) params.supplierId = filters.supplierId;
      if (filters.status) params.status = filters.status;

      const response = await reportsAPI.getPurchasesReport(params);
      setPurchases(response.data.data.purchases || []);
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

      const params = {};
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      if (filters.supplierId) params.supplierId = filters.supplierId;
      if (filters.status) params.status = filters.status;

      const response = await reportsAPI.exportPurchasesCSV(params);

      // Create download link with UTF-8 BOM for proper encoding (supports Unicode/Burmese text)
      const blob = new Blob(['\uFEFF' + response.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `purchases-report-${new Date().toISOString().split('T')[0]}.csv`;
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

  const formatAmount = (value) => {
    return formatCurrency(value, currency);
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>
          <FaChartBar className="me-2" />
          Purchases Report
        </h2>
        {purchases.length > 0 && (
          <Button variant="success" onClick={handleExport} disabled={exporting || !canGenerate}>
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
            <Col md={3}>
              <Card className="text-center h-100">
                <Card.Body>
                  <h6 className="text-muted">Total Orders</h6>
                  <h2 className="text-primary">{summary.totalOrders}</h2>
                  <small className="text-muted">Returns: {summary.totalReturns || 0}</small>
                </Card.Body>
              </Card>
            </Col>
            <Col md={3}>
              <Card className="text-center h-100">
                <Card.Body>
                  <h6 className="text-muted">Gross Amount</h6>
                  <h2 className="text-success">{formatAmount(summary.totalAmount)}</h2>
                  <small className="text-danger">Returns: -{formatAmount(summary.returnAmount || 0)}</small>
                </Card.Body>
              </Card>
            </Col>
            <Col md={3}>
              <Card className="text-center h-100">
                <Card.Body>
                  <h6 className="text-muted">Net Amount</h6>
                  <h2 className="text-success">{formatAmount(summary.netAmount || summary.totalAmount)}</h2>
                  <small className="text-muted">After returns</small>
                </Card.Body>
              </Card>
            </Col>
            <Col md={3}>
              <Card className="text-center h-100">
                <Card.Body>
                  <h6 className="text-muted">Net Tax</h6>
                  <h2 className="text-info">{formatAmount(summary.totalTax)}</h2>
                  <small className="text-muted">After returns</small>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </div>
      )}

      {/* Results Table */}
      <Card style={{ width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
        <Card.Header>
          Purchases Data {purchases.length > 0 && <Badge bg="primary" className="ms-2">{purchases.length} records</Badge>}
        </Card.Header>
        <Card.Body className="p-0" style={{ width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
          {loading ? (
            <div className="text-center py-4">
              <Spinner animation="border" variant="primary" />
            </div>
          ) : purchases.length === 0 ? (
            <Alert variant="info" className="m-3">
              No purchases data found. Use the filters above and click "Generate Report" to view purchases data.
            </Alert>
          ) : (
            <div style={{
              width: '100%',
              overflowX: 'auto',
              overflowY: 'auto',
              maxHeight: 'calc(100vh - 450px)',
              position: 'relative'
            }}>
              <table className="table table-striped table-hover mb-0" style={{
                width: '1700px',
                minWidth: '1700px',
                maxWidth: '1700px',
                tableLayout: 'fixed',
                margin: 0
              }}>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Order #</th>
                  <th>Original Order</th>
                  <th>Date</th>
                  <th>Supplier ID</th>
                  <th>Supplier</th>
                  <th>Item SKU</th>
                  <th>Item Name</th>
                  <th className="text-end">Qty</th>
                  <th className="text-end">FOC Qty</th>
                  <th className="text-end">Unit Price</th>
                  <th className="text-end">Item Disc %</th>
                  <th className="text-end">Order Disc %</th>
                  <th>Status</th>
                  <th className="text-end">Subtotal</th>
                  <th className="text-end">Tax</th>
                  <th className="text-end">Total</th>
                  <th>Created By</th>
                </tr>
              </thead>
              <tbody>
                {purchases.flatMap((transaction) =>
                  transaction.items && transaction.items.length > 0
                    ? transaction.items.map((item, idx) => (
                        <tr key={`${transaction.id}-${idx}`} className={transaction.type === 'return' ? 'table-warning' : ''}>
                          <td>
                            <Badge bg={transaction.type === 'return' ? 'danger' : 'success'}>
                              {transaction.type === 'return' ? 'Return' : 'Purchase'}
                            </Badge>
                          </td>
                          <td><code>{transaction.orderNumber}</code></td>
                          <td>{transaction.type === 'return' ? <code>{transaction.originalOrderNumber}</code> : '-'}</td>
                          <td>{new Date(transaction.createdAt).toLocaleDateString()}</td>
                          <td><code>{transaction.supplier?.id || '-'}</code></td>
                          <td>{transaction.supplier?.name || '-'}</td>
                          <td><code>{item.product?.sku || '-'}</code></td>
                          <td>{item.product?.name || '-'}</td>
                          <td className={`text-end ${item.quantity < 0 ? 'text-danger' : ''}`}>
                            {item.quantity}
                          </td>
                          <td className={`text-end ${item.focQuantity < 0 ? 'text-danger' : ''}`}>
                            {item.focQuantity !== 0 ? item.focQuantity : '-'}
                          </td>
                          <td className="text-end">{formatAmount(Math.abs(item.unitPrice))}</td>
                          <td className="text-end">
                            {item.discountPercent > 0 ? `${item.discountPercent}` : '-'}
                          </td>
                          <td className="text-end">
                            {transaction.discountPercent > 0 ? `${transaction.discountPercent}` : '-'}
                          </td>
                          <td><StatusBadge status={transaction.status} /></td>
                          <td className={`text-end ${item.itemSubtotal < 0 ? 'text-danger' : ''}`}>
                            {formatAmount(item.itemSubtotal)}
                          </td>
                          <td className={`text-end ${item.itemTax < 0 ? 'text-danger' : ''}`}>
                            {formatAmount(item.itemTax)}
                          </td>
                          <td className={`text-end fw-bold ${item.itemTotal < 0 ? 'text-danger' : ''}`}>
                            {formatAmount(item.itemTotal)}
                          </td>
                          <td>{transaction.user?.name || '-'}</td>
                        </tr>
                      ))
                    : [
                        <tr key={transaction.id} className={transaction.type === 'return' ? 'table-warning' : ''}>
                          <td>
                            <Badge bg={transaction.type === 'return' ? 'danger' : 'success'}>
                              {transaction.type === 'return' ? 'Return' : 'Purchase'}
                            </Badge>
                          </td>
                          <td><code>{transaction.orderNumber}</code></td>
                          <td>{transaction.type === 'return' ? <code>{transaction.originalOrderNumber}</code> : '-'}</td>
                          <td>{new Date(transaction.createdAt).toLocaleDateString()}</td>
                          <td><code>{transaction.supplier?.id || '-'}</code></td>
                          <td>{transaction.supplier?.name || '-'}</td>
                          <td>-</td>
                          <td>-</td>
                          <td className="text-end">-</td>
                          <td className="text-end">-</td>
                          <td className="text-end">-</td>
                          <td className="text-end">-</td>
                          <td className="text-end">
                            {transaction.discountPercent > 0 ? `${transaction.discountPercent}` : '-'}
                          </td>
                          <td><StatusBadge status={transaction.status} /></td>
                          <td className={`text-end ${transaction.subtotal < 0 ? 'text-danger' : ''}`}>
                            {formatAmount(transaction.subtotal)}
                          </td>
                          <td className={`text-end ${transaction.tax < 0 ? 'text-danger' : ''}`}>
                            {formatAmount(transaction.tax)}
                          </td>
                          <td className={`text-end fw-bold ${transaction.total < 0 ? 'text-danger' : ''}`}>
                            {formatAmount(transaction.total)}
                          </td>
                          <td>{transaction.user?.name || '-'}</td>
                        </tr>
                      ]
                )}
              </tbody>
              <tfoot>
                <tr className="table-dark">
                  <td colSpan="14" className="text-end fw-bold">Totals:</td>
                  <td className="text-end fw-bold">
                    {formatAmount(purchases.reduce((sum, p) => sum + parseFloat(p.subtotal), 0))}
                  </td>
                  <td className="text-end fw-bold">
                    {formatAmount(purchases.reduce((sum, p) => sum + parseFloat(p.tax), 0))}
                  </td>
                  <td className="text-end fw-bold">
                    {formatAmount(purchases.reduce((sum, p) => sum + parseFloat(p.total), 0))}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
              </table>
            </div>
          )}
        </Card.Body>
      </Card>
    </div>
  );
};

export default PurchasesReport;
