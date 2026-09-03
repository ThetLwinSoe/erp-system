import { useState, useEffect } from 'react';
import { Card, Table, Button, Spinner, Form } from 'react-bootstrap';
import { FaPlus, FaEye, FaTrash } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { inventoryAdjustmentsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import SearchBar from '../components/common/SearchBar';
import useDebounce from '../hooks/useDebounce';
import Pagination from '../components/common/Pagination';
import StatusBadge from '../components/common/StatusBadge';
import ConfirmModal from '../components/common/ConfirmModal';
import { INVENTORY_ADJUSTMENT_STATUS } from '../utils/constants';
import { extractApiError } from '../utils/errorUtils';
import ErrorAlert from '../components/common/ErrorAlert';
import SortableHeader from '../components/common/SortableHeader';

const InventoryAdjustments = () => {
  const navigate = useNavigate();
  const { isSuperAdmin } = useAuth();
  const [adjustments, setAdjustments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedAdjustment, setSelectedAdjustment] = useState(null);
  const [error, setError] = useState(null);

  const fetchAdjustments = async () => {
    try {
      setLoading(true);
      const params = { page, limit: 20, sortBy, sortOrder };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;

      const response = await inventoryAdjustmentsAPI.getAll(params);
      setAdjustments(response.data.data || []);
      setPagination(response.data.pagination || { total: 0, totalPages: 1 });
    } catch (err) {
      setError('Failed to load inventory adjustments');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdjustments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearch, statusFilter, sortBy, sortOrder]);

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortBy(field);
      setSortOrder('ASC');
    }
  };

  const handleDelete = async () => {
    try {
      await inventoryAdjustmentsAPI.delete(selectedAdjustment.id);
      setShowDeleteModal(false);
      fetchAdjustments();
    } catch (err) {
      setError(extractApiError(err, 'Delete failed'));
    }
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>Inventory Adjustments</h2>
        <Button variant="primary" onClick={() => navigate('/inventory-adjustments/new')}>
          <FaPlus className="me-2" />
          New Adjustment
        </Button>
      </div>

      <ErrorAlert error={error} dismissible onClose={() => setError(null)} />

      <Card>
        <Card.Header>
          <div className="d-flex gap-3 align-items-center">
            <div className="flex-grow-1">
              <SearchBar value={search} onChange={setSearch} placeholder="Search by adjustment number..." />
            </div>
            <Form.Select
              style={{ width: '180px' }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              {Object.values(INVENTORY_ADJUSTMENT_STATUS).map((status) => (
                <option key={status} value={status} className="text-capitalize">
                  {status}
                </option>
              ))}
            </Form.Select>
          </div>
        </Card.Header>
        <Card.Body>
          {loading ? (
            <div className="text-center py-4">
              <Spinner animation="border" variant="primary" />
            </div>
          ) : adjustments.length === 0 ? (
            <div className="text-center py-4 text-muted">
              No inventory adjustments found
            </div>
          ) : (
            <Table striped hover responsive>
              <thead>
                <tr>
                  <SortableHeader label="Adjustment #" field="adjustmentNumber" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Reason" field="reason" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Status" field="status" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Created By" field="user" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Date" field="createdAt" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {adjustments.map((adjustment) => (
                  <tr key={adjustment.id}>
                    <td>
                      <code>{adjustment.adjustmentNumber}</code>
                    </td>
                    <td>{adjustment.reason}</td>
                    <td>
                      <StatusBadge status={adjustment.status} />
                    </td>
                    <td>{adjustment.user?.name || '-'}</td>
                    <td>{new Date(adjustment.createdAt).toLocaleDateString()}</td>
                    <td>
                      <Button
                        variant="outline-info"
                        size="sm"
                        className="me-2"
                        onClick={() => navigate(`/inventory-adjustments/${adjustment.id}`)}
                        title="View Details"
                      >
                        <FaEye />
                      </Button>
                      {isSuperAdmin() && adjustment.status === 'pending' && (
                        <Button
                          variant="outline-danger"
                          size="sm"
                          onClick={() => {
                            setError(null);
                            setSelectedAdjustment(adjustment);
                            setShowDeleteModal(true);
                          }}
                          title="Delete"
                        >
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
          <span className="text-muted">Total: {pagination.total} adjustments</span>
          <Pagination currentPage={page} totalPages={pagination.totalPages} onPageChange={setPage} />
        </Card.Footer>
      </Card>

      <ConfirmModal
        show={showDeleteModal}
        onHide={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        title="Delete Adjustment"
        message={`Are you sure you want to delete adjustment ${selectedAdjustment?.adjustmentNumber}?`}
        error={error}
      />
    </div>
  );
};

export default InventoryAdjustments;
