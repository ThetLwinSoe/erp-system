import { useState, useEffect } from 'react';
import { Modal, Button, Form, Table, InputGroup, Row, Col } from 'react-bootstrap';
import { salesAPI, purchasesAPI, paymentsAPI } from '../../services/api';
import { formatCurrency } from '../../utils/currency';
import { extractApiError } from '../../utils/errorUtils';
import ErrorAlert from './ErrorAlert';
import { todayLocal, amountError, PAYMENT_METHOD_OPTIONS } from '../../utils/paymentForm';

const emptyForm = () => ({ amount: '', paymentDate: todayLocal(), method: '', reference: '', notes: '' });

/**
 * Settles several open Sale/Purchase orders belonging to one customer/
 * supplier with a single amount, applied oldest-order-first on the backend
 * (see payments.controller.js's settleBulk). Still creates one Payment row
 * per order under the hood, so Paid/Balance Due on each order's own detail
 * page and the Payments ledger's Order # column keep working unchanged.
 */
const SettlePaymentsModal = ({ show, onHide, contact, type, currency, onSettled }) => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [formData, setFormData] = useState(emptyForm);
  const [showMore, setShowMore] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!show || !contact) return;
    setFormData(emptyForm());
    setShowMore(false);
    setSelectedIds(new Set());
    setError(null);
    setLoading(true);

    const fetchOrders = type === 'customer'
      ? salesAPI.getAll({ customerId: contact.id, limit: 100 })
      : purchasesAPI.getAll({ supplierId: contact.id, limit: 100 });

    fetchOrders
      .then((res) => {
        const openOrders = (res.data.data || []).filter(
          (o) => o.status !== 'pending' && o.status !== 'cancelled' && o.paymentStatus !== 'paid'
        );
        setOrders(openOrders);
      })
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, [show, contact, type]);

  const balanceDue = (order) => parseFloat(order.total) - (order.paidAmount || 0);
  const selectedBalance = orders.filter((o) => selectedIds.has(o.id)).reduce((sum, o) => sum + balanceDue(o), 0);
  const invalid = selectedIds.size === 0 ? '' : amountError(formData.amount, selectedBalance, currency);

  // Recomputed on every selection change and used to (re)fill the Amount
  // field - still editable afterward, within the selected balance.
  const toggleSelected = (order) => {
    const next = new Set(selectedIds);
    if (next.has(order.id)) next.delete(order.id);
    else next.add(order.id);
    setSelectedIds(next);
    const total = orders.filter((o) => next.has(o.id)).reduce((sum, o) => sum + balanceDue(o), 0);
    setFormData((prev) => ({ ...prev, amount: total > 0 ? total.toFixed(2) : '' }));
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === orders.length) {
      setSelectedIds(new Set());
      setFormData((prev) => ({ ...prev, amount: '' }));
    } else {
      const next = new Set(orders.map((o) => o.id));
      setSelectedIds(next);
      const total = orders.reduce((sum, o) => sum + balanceDue(o), 0);
      setFormData((prev) => ({ ...prev, amount: total > 0 ? total.toFixed(2) : '' }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (invalid) return;
    setError(null);
    setSubmitting(true);
    try {
      const idsKey = type === 'customer' ? 'saleIds' : 'purchaseIds';
      await paymentsAPI.settleBulk({
        [idsKey]: [...selectedIds],
        ...formData,
        amount: parseFloat(formData.amount),
      });
      onSettled();
      onHide();
    } catch (err) {
      setError(extractApiError(err, 'Failed to settle payments'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>Settle Payments - {contact?.name}</Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit}>
        <Modal.Body>
          <ErrorAlert error={error} />

          {loading ? (
            <p className="text-muted">Loading open orders...</p>
          ) : orders.length === 0 ? (
            <p className="text-muted">No open orders to settle.</p>
          ) : (
            <Table size="sm" responsive className="mb-3">
              <thead>
                <tr>
                  <th>
                    <Form.Check checked={selectedIds.size === orders.length} onChange={toggleSelectAll} />
                  </th>
                  <th>Order #</th>
                  <th>Date</th>
                  <th>Total</th>
                  <th>Paid</th>
                  <th>Balance Due</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <Form.Check checked={selectedIds.has(order.id)} onChange={() => toggleSelected(order)} />
                    </td>
                    <td>{order.orderNumber}</td>
                    <td>{new Date(order.createdAt).toLocaleDateString()}</td>
                    <td>{formatCurrency(order.total, currency)}</td>
                    <td>{formatCurrency(order.paidAmount || 0, currency)}</td>
                    <td>{formatCurrency(balanceDue(order), currency)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}

          <div className="d-flex justify-content-between align-items-center rounded border px-3 py-2 mb-3 bg-light">
            <span>Balance due on the selected orders</span>
            <strong className={selectedBalance > 0 ? 'text-danger' : 'text-muted'}>{formatCurrency(selectedBalance, currency)}</strong>
          </div>

          <Form.Group className="mb-3">
            <Form.Label>Amount to Apply *</Form.Label>
            <InputGroup>
              <InputGroup.Text>{currency}</InputGroup.Text>
              <Form.Control
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                required
                disabled={selectedIds.size === 0}
                isInvalid={!!invalid}
              />
            </InputGroup>
            {invalid ? (
              <div className="text-danger small mt-1">{invalid}</div>
            ) : (
              <Form.Text className="text-muted">
                Filled from the selected orders' balances, allocated oldest order first.
              </Form.Text>
            )}
          </Form.Group>

          <Row>
            <Col md={6}>
              <Form.Group className="mb-3">
                <Form.Label>Payment Date *</Form.Label>
                <Form.Control
                  type="date"
                  required
                  value={formData.paymentDate}
                  onChange={(e) => setFormData({ ...formData, paymentDate: e.target.value })}
                />
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group className="mb-3">
                <Form.Label>Method</Form.Label>
                <Form.Control
                  type="text"
                  list="payment-method-options"
                  placeholder="Cash, bank transfer..."
                  value={formData.method}
                  onChange={(e) => setFormData({ ...formData, method: e.target.value })}
                />
                <datalist id="payment-method-options">
                  {PAYMENT_METHOD_OPTIONS.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </Form.Group>
            </Col>
          </Row>
          <Form.Group className="mb-2">
            <Form.Label>Reference</Form.Label>
            <Form.Control
              type="text"
              placeholder="Cheque #, transaction ID"
              value={formData.reference}
              onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
            />
          </Form.Group>
          <Button
            variant="link"
            className="p-0 mb-3 text-decoration-none"
            onClick={() => setShowMore(!showMore)}
            aria-expanded={showMore}
          >
            {showMore ? '− Hide details' : '+ More details'}
          </Button>
          {showMore && (
            <Form.Group className="mb-3">
              <Form.Label>Notes</Form.Label>
              <Form.Control
                as="textarea"
                rows={2}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </Form.Group>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onHide}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={submitting || selectedIds.size === 0 || !!invalid}>
            {submitting ? 'Settling...' : 'Settle Payments'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
};

export default SettlePaymentsModal;
