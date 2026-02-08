import { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Spinner, Badge } from 'react-bootstrap';
import { FaPlus, FaEdit, FaTrash, FaToggleOn, FaToggleOff } from 'react-icons/fa';
import { productsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import SearchBar from '../components/common/SearchBar';
import Pagination from '../components/common/Pagination';
import ConfirmModal from '../components/common/ConfirmModal';
import { formatCurrency } from '../utils/currency';
import { extractApiError } from '../utils/errorUtils';
import ErrorAlert from '../components/common/ErrorAlert';

const Products = () => {
  const { user, isSaleRep, isSuperAdmin } = useAuth();
  const currency = user?.company?.currency || 'USD';
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({
    sku: '',
    name: '',
    description: '',
    category: '',
    unit: 'piece',
    costPrice: '',
    sellingPrice: '',
    status: 'active',
  });

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const response = await productsAPI.getAll({ page, limit: 10, search });
      setProducts(response.data.data || []);
      setPagination(response.data.pagination || { total: 0, totalPages: 1 });
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [page, search]);

  const handleOpenModal = (product = null) => {
    if (product) {
      setSelectedProduct(product);
      setFormData({
        sku: product.sku,
        name: product.name,
        description: product.description || '',
        category: product.category || '',
        unit: product.unit || 'piece',
        costPrice: product.costPrice,
        sellingPrice: product.sellingPrice,
        status: product.status || 'active',
      });
    } else {
      setSelectedProduct(null);
      setFormData({ sku: '', name: '', description: '', category: '', unit: 'piece', costPrice: '', sellingPrice: '', status: 'active' });
    }
    setError(null);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    try {
      const data = {
        ...formData,
        costPrice: parseFloat(formData.costPrice),
        sellingPrice: parseFloat(formData.sellingPrice),
      };

      if (selectedProduct) {
        await productsAPI.update(selectedProduct.id, data);
      } else {
        await productsAPI.create(data);
      }
      setShowModal(false);
      fetchProducts();
    } catch (err) {
      setError(extractApiError(err, 'Operation failed'));
    }
  };

  const handleToggleStatus = async (product) => {
    try {
      await productsAPI.toggleStatus(product.id);
      fetchProducts();
    } catch (err) {
      console.error('Error toggling status:', err);
    }
  };

  const handleDelete = async () => {
    try {
      await productsAPI.delete(selectedProduct.id);
      setShowDeleteModal(false);
      fetchProducts();
    } catch (err) {
      setError(extractApiError(err, 'Delete failed'));
    }
  };

  const getStockBadge = (product) => {
    const inventory = product.inventory;
    if (!inventory) return <Badge bg="secondary">N/A</Badge>;

    const { quantity, minStockLevel } = inventory;
    if (quantity <= 0) return <Badge bg="danger">{quantity}</Badge>;
    if (quantity <= minStockLevel) return <Badge bg="warning">{quantity}</Badge>;
    return <Badge bg="success">{quantity}</Badge>;
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>Products</h2>
        {!isSaleRep() && (
          <Button variant="primary" onClick={() => handleOpenModal()}>
            <FaPlus className="me-2" />
            Add Product
          </Button>
        )}
      </div>

      <Card>
        <Card.Header>
          <SearchBar value={search} onChange={setSearch} placeholder="Search products..." />
        </Card.Header>
        <Card.Body>
          {loading ? (
            <div className="text-center py-4">
              <Spinner animation="border" variant="primary" />
            </div>
          ) : (
            <Table striped hover responsive>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Cost Price</th>
                  <th>Selling Price</th>
                  <th>Stock</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id}>
                    <td><code>{product.sku}</code></td>
                    <td>{product.name}</td>
                    <td>{product.category || '-'}</td>
                    <td>{formatCurrency(product.costPrice, currency)}</td>
                    <td>{formatCurrency(product.sellingPrice, currency)}</td>
                    <td>{getStockBadge(product)}</td>
                    <td>
                      <Badge bg={product.status === 'active' ? 'success' : 'secondary'}>
                        {product.status === 'active' ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td>
                      {!isSaleRep() && (
                        <>
                          <Button variant="outline-primary" size="sm" className="me-2" onClick={() => handleOpenModal(product)}>
                            <FaEdit />
                          </Button>
                          <Button
                            variant={product.status === 'active' ? 'outline-warning' : 'outline-success'}
                            size="sm"
                            className="me-2"
                            onClick={() => handleToggleStatus(product)}
                            title={product.status === 'active' ? 'Deactivate' : 'Activate'}
                          >
                            {product.status === 'active' ? <FaToggleOff /> : <FaToggleOn />}
                          </Button>
                          {isSuperAdmin() && (
                            <Button variant="outline-danger" size="sm" onClick={() => { setSelectedProduct(product); setShowDeleteModal(true); }}>
                              <FaTrash />
                            </Button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
        <Card.Footer className="d-flex justify-content-between align-items-center">
          <span className="text-muted">Total: {pagination.total} products</span>
          <Pagination currentPage={page} totalPages={pagination.totalPages} onPageChange={setPage} />
        </Card.Footer>
      </Card>

      <Modal show={showModal} onHide={() => setShowModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>{selectedProduct ? 'Edit Product' : 'Add Product'}</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            <ErrorAlert error={error} />
            <div className="row">
              <div className="col-md-6">
                <Form.Group className="mb-3">
                  <Form.Label>SKU *</Form.Label>
                  <Form.Control type="text" value={formData.sku} onChange={(e) => setFormData({ ...formData, sku: e.target.value })} required />
                </Form.Group>
              </div>
              <div className="col-md-6">
                <Form.Group className="mb-3">
                  <Form.Label>Name *</Form.Label>
                  <Form.Control type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                </Form.Group>
              </div>
              <div className="col-md-6">
                <Form.Group className="mb-3">
                  <Form.Label>Category</Form.Label>
                  <Form.Control type="text" value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} />
                </Form.Group>
              </div>
              <div className="col-md-6">
                <Form.Group className="mb-3">
                  <Form.Label>Unit</Form.Label>
                  <Form.Control type="text" value={formData.unit} onChange={(e) => setFormData({ ...formData, unit: e.target.value })} />
                </Form.Group>
              </div>
              <div className="col-md-6">
                <Form.Group className="mb-3">
                  <Form.Label>Cost Price *</Form.Label>
                  <Form.Control type="number" step="0.01" min="0" value={formData.costPrice} onChange={(e) => setFormData({ ...formData, costPrice: e.target.value })} required />
                </Form.Group>
              </div>
              <div className="col-md-6">
                <Form.Group className="mb-3">
                  <Form.Label>Selling Price *</Form.Label>
                  <Form.Control type="number" step="0.01" min="0" value={formData.sellingPrice} onChange={(e) => setFormData({ ...formData, sellingPrice: e.target.value })} required />
                </Form.Group>
              </div>
              <div className="col-md-6">
                <Form.Group className="mb-3">
                  <Form.Label>Status</Form.Label>
                  <div className="mt-1">
                    <Button
                      variant={formData.status === 'active' ? 'success' : 'secondary'}
                      size="sm"
                      onClick={() => setFormData({ ...formData, status: formData.status === 'active' ? 'inactive' : 'active' })}
                    >
                      {formData.status === 'active' ? <><FaToggleOn className="me-1" /> Active</> : <><FaToggleOff className="me-1" /> Inactive</>}
                    </Button>
                  </div>
                </Form.Group>
              </div>
              <div className="col-12">
                <Form.Group className="mb-3">
                  <Form.Label>Description</Form.Label>
                  <Form.Control as="textarea" rows={2} value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
                </Form.Group>
              </div>
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button variant="primary" type="submit">{selectedProduct ? 'Update' : 'Create'}</Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <ConfirmModal
        show={showDeleteModal}
        onHide={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        title="Delete Product"
        message={`Are you sure you want to delete ${selectedProduct?.name}?`}
      />
    </div>
  );
};

export default Products;
