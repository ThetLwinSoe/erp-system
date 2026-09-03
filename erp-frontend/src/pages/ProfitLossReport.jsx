import { useState, useEffect } from 'react';
import { Card, Table, Button, Form, Spinner, Alert, Row, Col, Badge } from 'react-bootstrap';
import { FaFileExport, FaFilePdf, FaSearch, FaChartLine } from 'react-icons/fa';
import { reportsAPI, companiesAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatCurrency } from '../utils/currency';
import { extractApiError } from '../utils/errorUtils';
import ErrorAlert from '../components/common/ErrorAlert';
import { generateProfitLossPDF } from '../utils/profitLossPdfGenerator';

const ProfitLossReport = () => {
  const { user, isSuperAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [products, setProducts] = useState([]);
  const [companies, setCompanies] = useState([]);

  const [filters, setFilters] = useState({ startDate: '', endDate: '', companyId: '' });

  useEffect(() => {
    if (isSuperAdmin()) {
      companiesAPI.getAll({ limit: 100 })
        .then((res) => setCompanies(res.data.data || []))
        .catch(() => setCompanies([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedCompany = isSuperAdmin()
    ? companies.find((c) => String(c.id) === String(filters.companyId))
    : user?.company;
  const currency = selectedCompany?.currency || 'USD';
  const canGenerate = !isSuperAdmin() || !!filters.companyId;

  const buildParams = () => {
    const params = {};
    if (filters.startDate) params.startDate = filters.startDate;
    if (filters.endDate) params.endDate = filters.endDate;
    if (isSuperAdmin() && filters.companyId) params.companyId = filters.companyId;
    return params;
  };

  const fetchReport = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await reportsAPI.getProfitLossReport(buildParams());
      setSummary(response.data.data.summary || null);
      setProducts(response.data.data.products || []);
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
      const response = await reportsAPI.exportProfitLossCSV(buildParams());

      const bom = String.fromCharCode(0xFEFF);
      const blob = new Blob([bom + response.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `profit-loss-report-${new Date().toISOString().split('T')[0]}.csv`;
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

  const handleExportPDF = () => {
    try {
      setGeneratingPdf(true);
      const company = selectedCompany ? {
        name: selectedCompany.name,
        address: selectedCompany.address,
        phone: selectedCompany.phone,
        email: selectedCompany.email,
        currency: selectedCompany.currency,
      } : null;

      generateProfitLossPDF({
        company,
        summary,
        products,
        startDate: filters.startDate,
        endDate: filters.endDate,
      });
    } catch (err) {
      setError('Failed to generate PDF');
      console.error(err);
    } finally {
      setGeneratingPdf(false);
    }
  };

  const formatAmount = (value) => formatCurrency(value, currency);

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>
          <FaChartLine className="me-2" />
          Profit &amp; Loss Report
          {isSuperAdmin() && summary && selectedCompany && (
            <small className="text-muted ms-2">— {selectedCompany.name}</small>
          )}
        </h2>
        {summary && (
          <div className="d-flex gap-2">
            <Button variant="success" onClick={handleExportCSV} disabled={exporting}>
              <FaFileExport className="me-2" />
              {exporting ? 'Exporting...' : 'Export to CSV'}
            </Button>
            <Button variant="danger" onClick={handleExportPDF} disabled={generatingPdf}>
              <FaFilePdf className="me-2" />
              {generatingPdf ? 'Generating...' : 'Export to PDF'}
            </Button>
          </div>
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
                      onChange={(e) => setFilters({ ...filters, companyId: e.target.value })}
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
                    value={filters.endDate}
                    onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                  />
                </Form.Group>
              </Col>
            </Row>
            <div className="mt-3">
              <Button variant="primary" type="submit" disabled={loading || !canGenerate}>
                <FaSearch className="me-2" />
                {loading ? 'Loading...' : 'Generate Report'}
              </Button>
              {isSuperAdmin() && !filters.companyId && (
                <small className="text-muted ms-2">Select a company to generate this report.</small>
              )}
            </div>
          </Form>
        </Card.Body>
      </Card>

      {summary && (
        <>
          {/* Profitability */}
          <Row className="g-3 mb-3">
            <Col md={3}>
              <Card className="text-center h-100">
                <Card.Body>
                  <h6 className="text-muted">Net Revenue</h6>
                  <h4 className="text-success">{formatAmount(summary.netRevenue)}</h4>
                </Card.Body>
              </Card>
            </Col>
            <Col md={3}>
              <Card className="text-center h-100">
                <Card.Body>
                  <h6 className="text-muted">Cost of Goods Sold</h6>
                  <h4 className="text-danger">{formatAmount(summary.cogs)}</h4>
                </Card.Body>
              </Card>
            </Col>
            <Col md={3}>
              <Card className="text-center h-100">
                <Card.Body>
                  <h6 className="text-muted">Gross Profit</h6>
                  <h4 className={summary.grossProfit >= 0 ? 'text-success' : 'text-danger'}>
                    {formatAmount(summary.grossProfit)}
                  </h4>
                </Card.Body>
              </Card>
            </Col>
            <Col md={3}>
              <Card className="text-center h-100">
                <Card.Body>
                  <h6 className="text-muted">Gross Margin</h6>
                  <h4 className={summary.grossMarginPercent >= 0 ? 'text-success' : 'text-danger'}>
                    {(summary.grossMarginPercent || 0).toFixed(2)}%
                  </h4>
                </Card.Body>
              </Card>
            </Col>
          </Row>

          {/* Adjustments & Net Profit */}
          <Row className="g-3 mb-3">
            <Col md={6}>
              <Card className="text-center h-100">
                <Card.Body>
                  <h6 className="text-muted">Inventory Adjustment Gain/(Loss)</h6>
                  <h4 className={summary.inventoryAdjustmentGainLoss >= 0 ? 'text-success' : 'text-danger'}>
                    {formatAmount(summary.inventoryAdjustmentGainLoss)}
                  </h4>
                  <small className="text-muted">From completed stock adjustments (damage, shrinkage, count corrections)</small>
                </Card.Body>
              </Card>
            </Col>
            <Col md={6}>
              <Card className="text-center h-100 border-primary">
                <Card.Body>
                  <h6 className="text-muted">Net Profit</h6>
                  <h3 className={summary.netProfit >= 0 ? 'text-success' : 'text-danger'}>
                    {formatAmount(summary.netProfit)}
                  </h3>
                  <small className="text-muted">Gross Profit + Inventory Adjustments (excludes operating expenses)</small>
                </Card.Body>
              </Card>
            </Col>
          </Row>

          {/* Tax - informational only, not part of profit */}
          <Row className="g-3 mb-3">
            <Col md={6}>
              <Card className="text-center h-100">
                <Card.Body>
                  <h6 className="text-muted">Tax Collected on Sales</h6>
                  <h4 className="text-info">{formatAmount(summary.taxCollected)}</h4>
                  <small className="text-muted">Owed to the government - not company revenue</small>
                </Card.Body>
              </Card>
            </Col>
            <Col md={6}>
              <Card className="text-center h-100">
                <Card.Body>
                  <h6 className="text-muted">Tax Paid on Purchases</h6>
                  <h4 className="text-info">{formatAmount(summary.taxPaid)}</h4>
                  <small className="text-muted">Paid to suppliers - reconcile per your tax regime</small>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </>
      )}

      {/* Product breakdown */}
      {summary && (
        <Card>
          <Card.Header>
            Product Breakdown {products.length > 0 && <Badge bg="primary" className="ms-2">{products.length} products</Badge>}
          </Card.Header>
          <Card.Body className="p-0">
            {loading ? (
              <div className="text-center py-4">
                <Spinner animation="border" variant="primary" />
              </div>
            ) : products.length === 0 ? (
              <Alert variant="info" className="m-3 mb-0">
                No sales found for this period.
              </Alert>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <Table striped hover responsive className="mb-0">
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Product</th>
                      <th className="text-end">Qty Sold</th>
                      <th className="text-end">Revenue</th>
                      <th className="text-end">COGS</th>
                      <th className="text-end">Gross Profit</th>
                      <th className="text-end">Margin %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => (
                      <tr key={p.productId}>
                        <td><code>{p.sku}</code></td>
                        <td>{p.name}</td>
                        <td className="text-end">{p.qtySold}</td>
                        <td className="text-end">{formatAmount(p.revenue)}</td>
                        <td className="text-end">{formatAmount(p.cogs)}</td>
                        <td className={`text-end ${p.grossProfit >= 0 ? '' : 'text-danger'}`}>
                          {formatAmount(p.grossProfit)}
                        </td>
                        <td className={`text-end ${p.marginPercent >= 0 ? '' : 'text-danger'}`}>
                          {p.marginPercent.toFixed(2)}%
                        </td>
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

export default ProfitLossReport;
