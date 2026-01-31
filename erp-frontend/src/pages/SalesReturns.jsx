import { useState, useEffect } from 'react';
import { Card, Table, Button, Spinner, Form } from 'react-bootstrap';
import { FaEye, FaTrash } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { salesReturnsAPI } from '../services/api';
import SearchBar from '../components/common/SearchBar';
import Pagination from '../components/common/Pagination';
import StatusBadge from '../components/common/StatusBadge';
import ConfirmModal from '../components/common/ConfirmModal';
import { SALES_RETURN_STATUS } from '../utils/constants';

const SalesReturns = () => {
  const navigate = useNavigate();
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState(null);
  const [error, setError] = useState('');

  const fetchReturns = async () => {
    try {
      setLoading(true);
      const params = { page, limit: 10 };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;

      const response = await salesReturnsAPI.getAll(params);
      setReturns(response.data.data || []);
      setPagination(response.data.pagination || { total: 0, totalPages: 1 });
    } catch (error) {
      console.error('Error fetching sales returns:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReturns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, statusFilter]);

  const handleDelete = async () => {
    try {
      await salesReturnsAPI.delete(selectedReturn.id);
      setShowDeleteModal(false);
      fetchReturns();
    } catch (err) {
      setError(err.response?.data?.message || 'Delete failed');
    }
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>Sales Returns</h2>
      </div>

      {error && (
        <div className="alert alert-danger alert-dismissible fade show" role="alert">
          {error}
          <button type="button" className="btn-close" onClick={() => setError('')}></button>
        </div>
      )}

      <Card>
        <Card.Header className="d-flex gap-3">
          <SearchBar value={search} onChange={setSearch} placeholder="Search return number..." />
          <Form.Select style={{ maxWidth: '200px' }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Status</option>
            {Object.values(SALES_RETURN_STATUS).map((status) => (
              <option key={status} value={status} className="text-capitalize">{status}</option>
            ))}
          </Form.Select>
        </Card.Header>
        <Card.Body>
          {loading ? (
            <div className="text-center py-4">
              <Spinner animation="border" variant="primary" />
            </div>
          ) : returns.length === 0 ? (
            <div className="text-center py-4 text-muted">
              No sales returns found
            </div>
          ) : (
            <Table striped hover responsive>
              <thead>
                <tr>
                  <th>Return #</th>
                  <th>Order #</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {returns.map((ret) => (
                  <tr key={ret.id}>
                    <td><code>{ret.returnNumber}</code></td>
                    <td><code>{ret.sale?.orderNumber}</code></td>
                    <td>{ret.sale?.customer?.name}</td>
                    <td><StatusBadge status={ret.status} /></td>
                    <td><strong>${parseFloat(ret.total || 0).toFixed(2)}</strong></td>
                    <td>{new Date(ret.createdAt).toLocaleDateString()}</td>
                    <td>
                      <Button variant="outline-info" size="sm" className="me-2" onClick={() => navigate(`/sales-returns/${ret.id}`)}>
                        <FaEye />
                      </Button>
                      {ret.status === 'pending' && (
                        <Button variant="outline-danger" size="sm" onClick={() => { setSelectedReturn(ret); setShowDeleteModal(true); }}>
                          <FaTrash />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
        <Card.Footer className="d-flex justify-content-between align-items-center">
          <span className="text-muted">Total: {pagination.total} returns</span>
          <Pagination currentPage={page} totalPages={pagination.totalPages} onPageChange={setPage} />
        </Card.Footer>
      </Card>

      <ConfirmModal
        show={showDeleteModal}
        onHide={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        title="Delete Sales Return"
        message={`Are you sure you want to delete return ${selectedReturn?.returnNumber}?`}
      />
    </div>
  );
};

export default SalesReturns;
