import { useRef, useEffect } from 'react';
import { Button, Form, Row, Col } from 'react-bootstrap';
import { FaTrash } from 'react-icons/fa';
import SearchableSelect from './SearchableSelect';

/**
 * The "Order Items" block shared by Create Sales Order and Create Purchase
 * Order (previously ~60 duplicated lines in each page - see RecordPaymentModal
 * for the same extraction done earlier for the payment dialogs).
 *
 * Alt+Enter from any field in the *last* row adds another row and moves focus
 * straight into its Product search, for fast repeated entry. Clicking
 * "+ Add Item" does the same focus move, since wanting to fill the new row in
 * next is the obvious reason to add one either way.
 */
const OrderItemsEditor = ({ items, productOptions, onAddItem, onRemoveItem, onItemChange, attemptedSubmit = false, minItems = 1 }) => {
  const rowRefs = useRef([]);
  const focusNewRowRef = useRef(false);

  useEffect(() => {
    if (focusNewRowRef.current) {
      focusNewRowRef.current = false;
      rowRefs.current[items.length - 1]?.focus();
    }
  }, [items.length]);

  const addItem = () => {
    focusNewRowRef.current = true;
    onAddItem();
  };

  const handleRowKeyDown = (e, index) => {
    if (e.altKey && e.key === 'Enter' && index === items.length - 1) {
      e.preventDefault();
      addItem();
    }
  };

  return (
    <div className="mb-3">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <Form.Label className="mb-0">Order Items *</Form.Label>
        <Button variant="outline-primary" size="sm" onClick={addItem}>+ Add Item</Button>
      </div>

      <Row className="mb-2">
        <Col md={3}><small className="text-muted fw-semibold">Product</small></Col>
        <Col md={2}><small className="text-muted fw-semibold">Quantity</small></Col>
        <Col md={2}><small className="text-muted fw-semibold">FOC Qty</small></Col>
        <Col md={2}><small className="text-muted fw-semibold">Unit Price</small></Col>
        <Col md={2}><small className="text-muted fw-semibold">Disc %</small></Col>
        <Col md={1}><small className="text-muted fw-semibold">Actions</small></Col>
      </Row>

      {items.map((item, index) => (
        <Row key={index} className="mb-2 align-items-end" onKeyDown={(e) => handleRowKeyDown(e, index)}>
          <Col md={3}>
            <SearchableSelect
              ref={(el) => { rowRefs.current[index] = el; }}
              options={productOptions}
              value={item.productId}
              onChange={(value) => onItemChange(index, 'productId', value)}
              placeholder="Search product..."
              isInvalid={attemptedSubmit && !item.productId}
            />
          </Col>
          <Col md={2}>
            <Form.Control type="number" min="0" placeholder="Qty" value={item.quantity} onChange={(e) => onItemChange(index, 'quantity', e.target.value)} required />
          </Col>
          <Col md={2}>
            <Form.Control type="number" min="0" placeholder="FOC Qty" value={item.focQuantity || 0} onChange={(e) => onItemChange(index, 'focQuantity', e.target.value)} />
          </Col>
          <Col md={2}>
            <Form.Control type="number" step="0.01" min="0" placeholder="Price" value={item.unitPrice} onChange={(e) => onItemChange(index, 'unitPrice', e.target.value)} required />
          </Col>
          <Col md={2}>
            <Form.Control type="number" step="0.01" min="0" max="100" placeholder="Disc %" value={item.discountPercent || 0} onChange={(e) => onItemChange(index, 'discountPercent', e.target.value)} />
          </Col>
          <Col md={1}>
            <Button variant="outline-danger" size="sm" onClick={() => onRemoveItem(index)} disabled={items.length === minItems}>
              <FaTrash />
            </Button>
          </Col>
        </Row>
      ))}
    </div>
  );
};

export default OrderItemsEditor;
