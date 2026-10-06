import { useState, useRef, useId } from 'react';
import { Modal, Button, Form, InputGroup, Row, Col } from 'react-bootstrap';
import { formatCurrency } from '../../utils/currency';
import { extractApiError } from '../../utils/errorUtils';
import { todayLocal, amountError, PAYMENT_METHOD_OPTIONS } from '../../utils/paymentForm';
import ErrorAlert from './ErrorAlert';

/**
 * Record one payment against a Sale or Purchase. Used by SaleDetails and
 * PurchaseDetails. The page supplies onSave, which posts the payment and
 * closes the modal; a rejected onSave shows its message here.
 */
const RecordPaymentModal = ({ show, onHide, title, balanceDue, currency = 'USD', onSave }) => {
  const emptyForm = () => ({
    amount: balanceDue > 0 ? balanceDue.toFixed(2) : '',
    paymentDate: todayLocal(),
    method: '',
    reference: '',
    notes: '',
  });
  const [form, setForm] = useState(emptyForm);
  const [showMore, setShowMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const amountRef = useRef(null);
  const methodListId = useId();

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });
  const invalid = amountError(form.amount, balanceDue, currency);

  // Reset on open, before the dialog is shown, so the previous entry never flashes.
  const reset = () => {
    setForm(emptyForm());
    setShowMore(false);
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (invalid) return;
    setError(null);
    setSaving(true);
    try {
      await onSave({
        amount: parseFloat(form.amount),
        paymentDate: form.paymentDate,
        method: form.method,
        reference: form.reference,
        notes: form.notes,
      });
    } catch (err) {
      setError(extractApiError(err, 'Failed to record payment'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      show={show}
      onHide={onHide}
      centered
      onEnter={reset}
      onEntered={() => amountRef.current?.focus()}
    >
      <Modal.Header closeButton>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit}>
        <Modal.Body>
          <ErrorAlert error={error} dismissible onClose={() => setError(null)} />
          <div
            className={`d-flex justify-content-between align-items-center rounded border px-3 py-2 mb-3 ${balanceDue > 0 ? 'bg-light' : 'bg-success-subtle'}`}
          >
            <span>Balance due on this order</span>
            <strong className={balanceDue > 0 ? 'text-danger' : 'text-success'}>{formatCurrency(balanceDue, currency)}</strong>
          </div>
          <Form.Group className="mb-3">
            <Form.Label>Amount *</Form.Label>
            <InputGroup>
              <InputGroup.Text>{currency}</InputGroup.Text>
              <Form.Control
                ref={amountRef}
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                required
                value={form.amount}
                onChange={set('amount')}
                isInvalid={!!invalid}
              />
            </InputGroup>
            {invalid ? (
              <div className="text-danger small mt-1">{invalid}</div>
            ) : (
              <Form.Text className="text-muted">Cannot be more than the balance due.</Form.Text>
            )}
          </Form.Group>
          <Row>
            <Col md={6}>
              <Form.Group className="mb-3">
                <Form.Label>Payment Date *</Form.Label>
                <Form.Control type="date" required value={form.paymentDate} onChange={set('paymentDate')} />
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group className="mb-3">
                <Form.Label>Method</Form.Label>
                <Form.Control
                  type="text"
                  list={methodListId}
                  placeholder="Cash, bank transfer..."
                  value={form.method}
                  onChange={set('method')}
                />
                <datalist id={methodListId}>
                  {PAYMENT_METHOD_OPTIONS.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </Form.Group>
            </Col>
          </Row>
          <Form.Group className="mb-2">
            <Form.Label>Reference</Form.Label>
            <Form.Control type="text" placeholder="Cheque #, transaction ID" value={form.reference} onChange={set('reference')} />
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
              <Form.Control as="textarea" rows={2} value={form.notes} onChange={set('notes')} />
            </Form.Group>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onHide}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={saving || !!invalid}>
            {saving ? 'Recording...' : 'Record Payment'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
};

export default RecordPaymentModal;
