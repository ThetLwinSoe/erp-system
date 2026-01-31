import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Table, Button, Spinner, Alert, Row, Col, Modal, Form, ProgressBar } from 'react-bootstrap';
import { FaArrowLeft, FaCheck, FaPrint } from 'react-icons/fa';
import { purchasesAPI, getStaticUrl } from '../services/api';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/common/StatusBadge';
import { generateInvoicePDF } from '../utils/invoiceGenerator';

const PurchaseDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [purchase, setPurchase] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [receiveItems, setReceiveItems] = useState([]);

  const fetchPurchase = async () => {
    try {
      setLoading(true);
      const response = await purchasesAPI.getById(id);
      setPurchase(response.data.data);
    } catch (err) {
      setError('Failed to load purchase details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPurchase();
  }, [id]);

  const handleStatusChange = async (newStatus) => {
    try {
      setUpdating(true);
      await purchasesAPI.updateStatus(id, newStatus);
      fetchPurchase();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update status');
    } finally {
      setUpdating(false);
    }
  };

  const handleOpenReceiveModal = () => {
    const items = purchase.items.map((item) => ({
      productId: item.productId,
      productName: item.product?.name,
      ordered: item.quantity,
      received: item.receivedQuantity || 0,
      toReceive: item.quantity - (item.receivedQuantity || 0),
    }));
    setReceiveItems(items);
    setShowReceiveModal(true);
  };

  const handleReceiveChange = (index, value) => {
    const newItems = [...receiveItems];
    const maxReceive = newItems[index].ordered - newItems[index].received;
    newItems[index].toReceive = Math.min(Math.max(0, parseInt(value) || 0), maxReceive);
    setReceiveItems(newItems);
  };

  const handleReceiveGoods = async () => {
    try {
      setUpdating(true);
      const items = receiveItems
        .filter((item) => item.toReceive > 0)
        .map((item) => ({
          productId: item.productId,
          quantity: item.toReceive,
        }));

      if (items.length === 0) {
        setError('Please enter quantities to receive');
        return;
      }

      await purchasesAPI.receive(id, items);
      setShowReceiveModal(false);
      fetchPurchase();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to receive goods');
    } finally {
      setUpdating(false);
    }
  };

  const getNextStatuses = () => {
    const transitions = {
      pending: ['approved', 'cancelled'],
      approved: ['ordered', 'cancelled'],
      ordered: ['cancelled'],
      partial: ['cancelled'],
      received: [],
      cancelled: [],
    };
    return transitions[purchase?.status] || [];
  };

  const canReceive = () => {
    return ['ordered', 'partial'].includes(purchase?.status);
  };

  const canPrint = () => {
    return ['ordered', 'partial', 'received'].includes(purchase?.status);
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
      } : null;

      await generateInvoicePDF({
        type: 'purchase',
        order: purchase,
        company,
      });
    } catch (err) {
      setError('Failed to generate purchase order PDF');
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

  if (!purchase) {
    return <Alert variant="danger">Purchase not found</Alert>;
  }

  return (
    <div>
      <Button variant="link" className="mb-3 ps-0" onClick={() => navigate('/purchases')}>
        <FaArrowLeft className="me-2" />
        Back to Purchases
      </Button>

      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}

      <Row className="g-4">
        <Col md={8}>
          <Card>
            <Card.Header className="d-flex justify-content-between align-items-center">
              <h5 className="mb-0">Order: {purchase.orderNumber}</h5>
              <div className="d-flex align-items-center gap-2">
                {canPrint() && (
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    onClick={handlePrintInvoice}
                    disabled={printing}
                  >
                    <FaPrint className="me-1" />
                    {printing ? 'Generating...' : 'Print PO'}
                  </Button>
                )}
                <StatusBadge status={purchase.status} />
              </div>
            </Card.Header>
            <Card.Body>
              <Table striped hover>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>Ordered</th>
                    <th>Received</th>
                    <th>Unit Price</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {purchase.items?.map((item) => (
                    <tr key={item.id}>
                      <td>{item.product?.name}</td>
                      <td><code>{item.product?.sku}</code></td>
                      <td>{item.quantity}</td>
                      <td>
                        {item.receivedQuantity || 0}
                        {item.receivedQuantity < item.quantity && (
                          <ProgressBar
                            now={(item.receivedQuantity / item.quantity) * 100}
                            style={{ height: '5px', marginTop: '4px' }}
                          />
                        )}
                      </td>
                      <td>${parseFloat(item.unitPrice).toFixed(2)}</td>
                      <td>${parseFloat(item.total).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan="5" className="text-end">Subtotal:</td>
                    <td>${parseFloat(purchase.subtotal).toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td colSpan="5" className="text-end">Tax:</td>
                    <td>${parseFloat(purchase.tax).toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td colSpan="5" className="text-end"><strong>Total:</strong></td>
                    <td><strong>${parseFloat(purchase.total).toFixed(2)}</strong></td>
                  </tr>
                </tfoot>
              </Table>

              {purchase.notes && (
                <Alert variant="light">
                  <strong>Notes:</strong> {purchase.notes}
                </Alert>
              )}
            </Card.Body>
          </Card>
        </Col>

        <Col md={4}>
          <Card className="mb-4">
            <Card.Header>Supplier Info</Card.Header>
            <Card.Body>
              <p className="mb-1"><strong>{purchase.supplier?.name}</strong></p>
              <p className="mb-1 text-muted">{purchase.supplier?.email}</p>
              <p className="mb-0 text-muted">{purchase.supplier?.phone}</p>
            </Card.Body>
          </Card>

          <Card className="mb-4">
            <Card.Header>Order Info</Card.Header>
            <Card.Body>
              <p className="mb-1"><strong>Created:</strong> {new Date(purchase.createdAt).toLocaleString()}</p>
              <p className="mb-1"><strong>Created By:</strong> {purchase.user?.name}</p>
              {purchase.expectedDelivery && (
                <p className="mb-1"><strong>Expected Delivery:</strong> {new Date(purchase.expectedDelivery).toLocaleDateString()}</p>
              )}
              <p className="mb-0"><strong>Last Updated:</strong> {new Date(purchase.updatedAt).toLocaleString()}</p>
            </Card.Body>
          </Card>

          <Card>
            <Card.Header>Actions</Card.Header>
            <Card.Body>
              <div className="d-grid gap-2">
                {canReceive() && (
                  <Button variant="success" onClick={handleOpenReceiveModal}>
                    <FaCheck className="me-2" />
                    Receive Goods
                  </Button>
                )}
                {getNextStatuses().map((status) => (
                  <Button
                    key={status}
                    variant={status === 'cancelled' ? 'outline-danger' : 'outline-primary'}
                    onClick={() => handleStatusChange(status)}
                    disabled={updating}
                    className="text-capitalize"
                  >
                    {updating ? 'Updating...' : `Mark as ${status}`}
                  </Button>
                ))}
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Modal show={showReceiveModal} onHide={() => setShowReceiveModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Receive Goods</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}
          <Table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Pending</th>
                <th>Receive Qty</th>
              </tr>
            </thead>
            <tbody>
              {receiveItems.map((item, index) => (
                <tr key={item.productId}>
                  <td>{item.productName}</td>
                  <td>{item.ordered - item.received}</td>
                  <td>
                    <Form.Control
                      type="number"
                      min="0"
                      max={item.ordered - item.received}
                      value={item.toReceive}
                      onChange={(e) => handleReceiveChange(index, e.target.value)}
                      style={{ width: '80px' }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowReceiveModal(false)}>Cancel</Button>
          <Button variant="success" onClick={handleReceiveGoods} disabled={updating}>
            {updating ? 'Processing...' : 'Confirm Receipt'}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default PurchaseDetails;
