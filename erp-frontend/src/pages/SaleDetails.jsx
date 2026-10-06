import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Table, Button, Spinner, Alert, Row, Col, Form, Badge, Modal } from 'react-bootstrap';
import { FaArrowLeft, FaPrint, FaUndo, FaMoneyBillWave } from 'react-icons/fa';
import { salesAPI, paymentsAPI, customersAPI, getStaticUrl } from '../services/api';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/common/StatusBadge';
import { ORDER_STATUS } from '../utils/constants';
import { generateInvoicePDF } from '../utils/invoiceGenerator';
import { formatCurrency } from '../utils/currency';
import { extractApiError } from '../utils/errorUtils';
import ErrorAlert from '../components/common/ErrorAlert';
import CreditWarningAlert from '../components/common/CreditWarningAlert';
import RecordPaymentModal from '../components/common/RecordPaymentModal';


const SaleDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, canAccessCreditControl } = useAuth();
  const currency = user?.company?.currency || 'USD';
  const [sale, setSale] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [payments, setPayments] = useState([]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [creditStatus, setCreditStatus] = useState(null);

  const fetchSale = async () => {
    try {
      setLoading(true);
      const response = await salesAPI.getById(id);
      setSale(response.data.data);
    } catch {
      setError('Failed to load sale details');
    } finally {
      setLoading(false);
    }
  };

  const fetchPayments = async () => {
    try {
      const response = await paymentsAPI.getAll({ saleId: id, limit: 100 });
      setPayments(response.data.data || []);
    } catch {
      setPayments([]);
    }
  };

  useEffect(() => {
    fetchSale();
    if (canAccessCreditControl()) fetchPayments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Only relevant while the order is still Pending - this is the moment an
  // Admin/Manager/Staff reviews what the Sale Rep created and decides
  // whether to confirm it, so that's when the credit check matters.
  useEffect(() => {
    if (!sale || sale.status !== 'pending' || !canAccessCreditControl()) {
      setCreditStatus(null);
      return;
    }
    customersAPI.getCreditStatus(sale.customerId)
      .then((res) => setCreditStatus(res.data.data))
      .catch(() => setCreditStatus(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sale?.id, sale?.status]);

  const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
  const balanceDue = sale ? parseFloat(sale.total) - totalPaid : 0;

  const handleOpenPaymentModal = () => setShowPaymentModal(true);

  // Throws on failure so RecordPaymentModal can show the message.
  const savePayment = async (data) => {
    await paymentsAPI.create({ saleId: id, ...data });
    setShowPaymentModal(false);
    fetchPayments();
  };

  const handleStatusChange = async (newStatus) => {
    try {
      setUpdating(true);
      await salesAPI.updateStatus(id, newStatus);
      fetchSale();
    } catch (err) {
      setError(extractApiError(err, 'Failed to update status'));
    } finally {
      setUpdating(false);
    }
  };

  const getNextStatuses = () => {
    const transitions = {
      pending: ['confirmed', 'cancelled'],
      confirmed: ['shipped', 'cancelled'],
      shipped: ['delivered', 'cancelled'],
      delivered: [],
      cancelled: [],
    };
    return transitions[sale?.status] || [];
  };

  // Mirrors the server guard in SalesService.updateSaleStatus: an order with
  // payments recorded can't be cancelled until they're removed.
  const cancelBlockedByPayments = () => totalPaid > 0;

  const canPrint = () => {
    return ['confirmed', 'shipped', 'delivered'].includes(sale?.status);
  };

  const canReturn = () => {
    return ['confirmed', 'shipped', 'delivered'].includes(sale?.status);
  };

  const canRecordPayment = () => {
    return sale?.status !== 'pending' && sale?.status !== 'cancelled' && balanceDue > 0;
  };

  const recordPaymentDisabledReason = () => {
    if (sale?.status === 'pending' || sale?.status === 'cancelled') return 'Order must be confirmed before recording payments.';
    if (balanceDue <= 0) return 'This order is already fully paid.';
    return '';
  };

  const handlePrintInvoice = async () => {
    try {
      setPrinting(true);
      const company = user?.company ? {
        name: user.company.name,
        logo: user.company.logo ? getStaticUrl(user.company.logo) : null,
        address: user.company.address,
        phone: user.company.phone,
        email: user.company.email,
        currency: user.company.currency,
      } : null;

      await generateInvoicePDF({
        type: 'sale',
        order: sale,
        company,
      });
    } catch (err) {
      setError('Failed to generate invoice PDF');
      console.error(err);
    } finally {
      setPrinting(false);
    }
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ height: '400px' }}>
        <Spinner animation="border" variant="primary" />
      </div>
    );
  }

  if (!sale) {
    return <Alert variant="danger">Sale not found</Alert>;
  }

  return (
    <div>
      <Button variant="link" className="mb-3 ps-0" onClick={() => navigate('/sales')}>
        <FaArrowLeft className="me-2" />
        Back to Sales
      </Button>

      <ErrorAlert error={error} dismissible onClose={() => setError(null)} />

      <Row className="g-4">
        <Col md={8}>
          <Card>
            <Card.Header className="d-flex justify-content-between align-items-center">
              <h5 className="mb-0">Order: {sale.orderNumber}</h5>
              <div className="d-flex align-items-center gap-2">
                {canReturn() && (
                  <Button
                    variant="outline-warning"
                    size="sm"
                    onClick={() => navigate(`/sales/${id}/return`)}
                  >
                    <FaUndo className="me-1" />
                    Create Return
                  </Button>
                )}
                {canPrint() && (
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    onClick={handlePrintInvoice}
                    disabled={printing}
                  >
                    <FaPrint className="me-1" />
                    {printing ? 'Generating...' : 'Print Invoice'}
                  </Button>
                )}
                <StatusBadge status={sale.status} />
              </div>
            </Card.Header>
            <Card.Body>
              <Table striped hover>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>Quantity</th>
                    <th>FOC Qty</th>
                    <th>Unit Price</th>
                    <th>Discount %</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sale.items?.map((item) => (
                    <tr key={item.id}>
                      <td>{item.product?.name}</td>
                      <td><code>{item.product?.sku}</code></td>
                      <td>{item.quantity}</td>
                      <td>{item.focQuantity > 0 ? <Badge bg="info">{item.focQuantity}</Badge> : '-'}</td>
                      <td>{formatCurrency(item.unitPrice, currency)}</td>
                      <td>
                        {item.discountPercent > 0
                          ? `${item.discountPercent} (-${formatCurrency(item.discountAmount, currency)})`
                          : '-'}
                      </td>
                      <td>{formatCurrency(item.total, currency)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan="6" className="text-end">Subtotal (after item discounts):</td>
                    <td>{formatCurrency(sale.subtotal, currency)}</td>
                  </tr>
                  {sale.discountPercent > 0 && (
                    <tr>
                      <td colSpan="6" className="text-end">Order Discount % ({sale.discountPercent}):</td>
                      <td className="text-danger">-{formatCurrency(sale.discountAmount, currency)}</td>
                    </tr>
                  )}
                  <tr>
                    <td colSpan="6" className="text-end">Tax:</td>
                    <td>{formatCurrency(sale.tax, currency)}</td>
                  </tr>
                  <tr>
                    <td colSpan="6" className="text-end"><strong>Total:</strong></td>
                    <td><strong>{formatCurrency(sale.total, currency)}</strong></td>
                  </tr>
                </tfoot>
              </Table>

              {sale.notes && (
                <Alert variant="light">
                  <strong>Notes:</strong> {sale.notes}
                </Alert>
              )}
            </Card.Body>
          </Card>
        </Col>

        <Col md={4}>
          <Card className="mb-4">
            <Card.Header>Customer Info</Card.Header>
            <Card.Body>
              <p className="mb-1">
                <strong>{sale.customer?.name}</strong>
                {sale.customer?.customerCode && <span className="text-muted"> ({sale.customer.customerCode})</span>}
              </p>
              <p className="mb-1 text-muted">{sale.customer?.email}</p>
              <p className="mb-1 text-muted">{sale.customer?.phone}</p>
              {(sale.customer?.city || sale.customer?.country) && (
                <p className="mb-0 text-muted">
                  {[sale.customer?.city, sale.customer?.country].filter(Boolean).join(', ')}
                </p>
              )}
            </Card.Body>
          </Card>

          <Card className="mb-4">
            <Card.Header>Order Info</Card.Header>
            <Card.Body>
              <p className="mb-1"><strong>Created:</strong> {new Date(sale.createdAt).toLocaleString()}</p>
              <p className="mb-1"><strong>Created By:</strong> {sale.user?.name}</p>
              <p className="mb-0"><strong>Last Updated:</strong> {new Date(sale.updatedAt).toLocaleString()}</p>
            </Card.Body>
          </Card>

          {getNextStatuses().length > 0 && (
            <Card className="mb-4">
              <Card.Header>Update Status</Card.Header>
              <Card.Body>
                {sale.status === 'pending' && (
                  <CreditWarningAlert creditStatus={creditStatus} orderTotal={sale.total} type="customer" currency={currency} />
                )}
                <div className="d-grid gap-2">
                  {getNextStatuses().map((status) => (
                    <Button
                      key={status}
                      variant={status === 'cancelled' ? 'outline-danger' : 'outline-primary'}
                      onClick={() => handleStatusChange(status)}
                      disabled={updating || (status === 'cancelled' && cancelBlockedByPayments())}
                      className="text-capitalize"
                    >
                      {updating ? 'Updating...' : `Mark as ${status}`}
                    </Button>
                  ))}
                </div>
                {cancelBlockedByPayments() && getNextStatuses().includes('cancelled') && (
                  <small className="text-muted d-block mt-2">Cancel is unavailable while payments are recorded on this order.</small>
                )}
              </Card.Body>
            </Card>
          )}

          {canAccessCreditControl() && (
            <Card>
              <Card.Header className="d-flex justify-content-between align-items-center">
                Payments
                <span title={canRecordPayment() ? '' : recordPaymentDisabledReason()}>
                  <Button variant="outline-primary" size="sm" onClick={handleOpenPaymentModal} disabled={!canRecordPayment()}>
                    <FaMoneyBillWave className="me-1" />
                    Record Payment
                  </Button>
                </span>
              </Card.Header>
              <Card.Body>
                {payments.length === 0 ? (
                  <p className="text-muted mb-3">No payments recorded yet.</p>
                ) : (
                  <Table size="sm" className="mb-3">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Amount</th>
                        <th>Method</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => (
                        <tr key={p.id}>
                          <td>{new Date(p.paymentDate).toLocaleDateString()}</td>
                          <td>{formatCurrency(p.amount, currency)}</td>
                          <td>{p.method || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
                <p className="mb-1"><strong>Paid:</strong> {formatCurrency(totalPaid, currency)}</p>
                <p className="mb-0">
                  <strong>Balance Due:</strong>{' '}
                  <span className={balanceDue > 0 ? 'text-danger' : 'text-success'}>{formatCurrency(balanceDue, currency)}</span>
                </p>
              </Card.Body>
            </Card>
          )}
        </Col>
      </Row>

      <RecordPaymentModal
        show={showPaymentModal}
        onHide={() => setShowPaymentModal(false)}
        title={`Record Payment - ${sale.orderNumber}`}
        balanceDue={balanceDue}
        currency={currency}
        onSave={savePayment}
      />
    </div>
  );
};

export default SaleDetails;
