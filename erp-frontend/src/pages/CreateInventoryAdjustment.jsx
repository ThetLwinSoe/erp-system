import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Table, Button, Spinner, Alert, Row, Col, Form } from 'react-bootstrap';
import { FaArrowLeft, FaTimes, FaPlus } from 'react-icons/fa';
import { inventoryAdjustmentsAPI } from '../services/api';
import { INVENTORY_ADJUSTMENT_REASONS } from '../utils/constants';

const CreateInventoryAdjustment = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [allProducts, setAllProducts] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState({});
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const response = await inventoryAdjustmentsAPI.getProductsWithStock();
      const products = response.data.data || [];
      setAllProducts(products);

      // Initialize all products as selected with their current stock as ground value
      const initialSelected = {};
      products.forEach((product) => {
        initialSelected[product.id] = {
          product,
          groundValue: product.currentStock,
          included: true,
        };
      });
      setSelectedProducts(initialSelected);
    } catch (err) {
      setError('Failed to load products');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleGroundValueChange = (productId, value) => {
    const qty = Math.max(0, parseInt(value) || 0);
    setSelectedProducts({
      ...selectedProducts,
      [productId]: {
        ...selectedProducts[productId],
        groundValue: qty,
      },
    });
  };

  const handleRemoveProduct = (productId) => {
    setSelectedProducts({
      ...selectedProducts,
      [productId]: {
        ...selectedProducts[productId],
        included: false,
      },
    });
  };

  const handleAddProduct = (productId) => {
    const product = allProducts.find((p) => p.id === productId);
    if (product) {
      setSelectedProducts({
        ...selectedProducts,
        [productId]: {
          product,
          groundValue: product.currentStock,
          included: true,
        },
      });
    }
  };

  const getItemsToSubmit = () => {
    return Object.entries(selectedProducts)
      .filter(([, item]) => {
        // Only include if product is in the list AND ground value differs from current
        return item.included && item.groundValue !== item.product.currentStock;
      })
      .map(([productId, item]) => ({
        productId: parseInt(productId),
        adjustmentType: 'set',
        quantityAdjusted: item.groundValue,
      }));
  };

  const hasChanges = () => {
    return getItemsToSubmit().length > 0;
  };

  const getSummary = () => {
    let totalAdding = 0;
    let totalRemoving = 0;
    let productsAffected = 0;

    Object.values(selectedProducts).forEach((item) => {
      if (!item.included) return;

      const diff = item.groundValue - item.product.currentStock;
      if (diff !== 0) {
        productsAffected++;
        if (diff > 0) totalAdding += diff;
        if (diff < 0) totalRemoving += Math.abs(diff);
      }
    });

    return { productsAffected, totalAdding, totalRemoving };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!reason) {
      setError('Please select a reason for the adjustment');
      return;
    }

    const items = getItemsToSubmit();
    if (items.length === 0) {
      setError('Please adjust at least one product quantity');
      return;
    }

    try {
      setSubmitting(true);
      await inventoryAdjustmentsAPI.create({
        items,
        reason,
        notes,
      });
      navigate('/inventory-adjustments');
    } catch (err) {
      // Show detailed validation errors if available
      const errorData = err.response?.data;
      let errorMessage = errorData?.message || 'Failed to create adjustment';
      if (errorData?.errors && Array.isArray(errorData.errors)) {
        const details = errorData.errors.map(e => `${e.field}: ${e.message}`).join(', ');
        errorMessage = `${errorMessage} - ${details}`;
      }
      setError(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  // Filter for display - only show included products
  const includedProducts = Object.entries(selectedProducts)
    .filter(([, item]) => item.included)
    .filter(([, item]) => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        item.product.name.toLowerCase().includes(term) ||
        item.product.sku.toLowerCase().includes(term) ||
        (item.product.category && item.product.category.toLowerCase().includes(term))
      );
    });

  // Get removed products for "Add back" functionality
  const removedProducts = Object.entries(selectedProducts)
    .filter(([, item]) => !item.included)
    .map(([, item]) => item.product);

  const summary = getSummary();

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ height: '400px' }}>
        <Spinner animation="border" variant="primary" />
      </div>
    );
  }

  return (
    <div>
      <Button variant="link" className="mb-3 ps-0" onClick={() => navigate('/inventory-adjustments')}>
        <FaArrowLeft className="me-2" />
        Back to Adjustments
      </Button>

      <h2 className="mb-4">Create Inventory Adjustment</h2>

      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}

      <Form onSubmit={handleSubmit}>
        <Row className="g-4">
          <Col md={8}>
            <Card>
              <Card.Header>
                <div className="d-flex justify-content-between align-items-center">
                  <span>Products ({includedProducts.length})</span>
                  <Form.Control
                    type="text"
                    placeholder="Search products..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ width: '250px' }}
                    size="sm"
                  />
                </div>
              </Card.Header>
              <Card.Body style={{ maxHeight: '500px', overflowY: 'auto' }}>
                <Table striped hover size="sm">
                  <thead style={{ position: 'sticky', top: 0, background: 'white' }}>
                    <tr>
                      <th>SKU</th>
                      <th>Product</th>
                      <th className="text-center">Current</th>
                      <th style={{ width: '120px' }}>Ground</th>
                      <th className="text-center">Diff</th>
                      <th style={{ width: '50px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {includedProducts.map(([productId, item]) => {
                      const diff = item.groundValue - item.product.currentStock;
                      const hasChange = diff !== 0;

                      return (
                        <tr key={productId} className={hasChange ? 'table-warning' : ''}>
                          <td><code>{item.product.sku}</code></td>
                          <td>
                            {item.product.name}
                            {item.product.category && (
                              <small className="text-muted d-block">{item.product.category}</small>
                            )}
                          </td>
                          <td className="text-center">
                            <strong>{item.product.currentStock}</strong>
                          </td>
                          <td>
                            <Form.Control
                              type="number"
                              size="sm"
                              min="0"
                              value={item.groundValue}
                              onChange={(e) => handleGroundValueChange(parseInt(productId), e.target.value)}
                            />
                          </td>
                          <td className="text-center">
                            {hasChange ? (
                              <strong className={diff > 0 ? 'text-success' : 'text-danger'}>
                                {diff > 0 ? `+${diff}` : diff}
                              </strong>
                            ) : (
                              <span className="text-muted">-</span>
                            )}
                          </td>
                          <td>
                            <Button
                              variant="outline-danger"
                              size="sm"
                              onClick={() => handleRemoveProduct(parseInt(productId))}
                              title="Remove from adjustment"
                            >
                              <FaTimes />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
                {includedProducts.length === 0 && (
                  <div className="text-center text-muted py-4">
                    No products in the adjustment list
                  </div>
                )}
              </Card.Body>
            </Card>

            {removedProducts.length > 0 && (
              <Card className="mt-3">
                <Card.Header>
                  <small>Removed Products ({removedProducts.length})</small>
                </Card.Header>
                <Card.Body style={{ maxHeight: '150px', overflowY: 'auto' }}>
                  <div className="d-flex flex-wrap gap-2">
                    {removedProducts.map((product) => (
                      <Button
                        key={product.id}
                        variant="outline-secondary"
                        size="sm"
                        onClick={() => handleAddProduct(product.id)}
                        title="Add back to adjustment"
                      >
                        <FaPlus className="me-1" />
                        {product.sku}
                      </Button>
                    ))}
                  </div>
                </Card.Body>
              </Card>
            )}
          </Col>

          <Col md={4}>
            <Card className="mb-4">
              <Card.Header>Adjustment Details</Card.Header>
              <Card.Body>
                <Form.Group className="mb-3">
                  <Form.Label>Reason *</Form.Label>
                  <Form.Select
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    required
                  >
                    <option value="">Select reason...</option>
                    {INVENTORY_ADJUSTMENT_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Notes</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Additional notes..."
                  />
                </Form.Group>
              </Card.Body>
            </Card>

            <Card className="mb-4">
              <Card.Header>Summary</Card.Header>
              <Card.Body>
                <div className="d-flex justify-content-between mb-2">
                  <span>Products to adjust:</span>
                  <strong>{summary.productsAffected}</strong>
                </div>
                <div className="d-flex justify-content-between mb-2">
                  <span>Total adding:</span>
                  <strong className="text-success">+{summary.totalAdding}</strong>
                </div>
                <div className="d-flex justify-content-between mb-2">
                  <span>Total removing:</span>
                  <strong className="text-danger">-{summary.totalRemoving}</strong>
                </div>
                <hr />
                <small className="text-muted">
                  Note: Changes will be applied when the adjustment is approved and completed.
                </small>
              </Card.Body>
            </Card>

            <div className="d-grid gap-2">
              <Button
                variant="primary"
                type="submit"
                disabled={submitting || !hasChanges()}
              >
                {submitting ? 'Creating...' : 'Create Adjustment'}
              </Button>
              <Button
                variant="outline-secondary"
                onClick={() => navigate('/inventory-adjustments')}
              >
                Cancel
              </Button>
            </div>
          </Col>
        </Row>
      </Form>
    </div>
  );
};

export default CreateInventoryAdjustment;
