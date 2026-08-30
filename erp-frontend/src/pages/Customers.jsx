import { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Spinner, Badge } from 'react-bootstrap';
import { FaPlus, FaEdit, FaTrash, FaToggleOn, FaToggleOff, FaFileExport, FaFileImport } from 'react-icons/fa';
import { customersAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import SearchBar from '../components/common/SearchBar';
import Pagination from '../components/common/Pagination';
import ConfirmModal from '../components/common/ConfirmModal';
import ImportCsvModal from '../components/common/ImportCsvModal';
import SortableHeader from '../components/common/SortableHeader';
import { CUSTOMER_TYPES, CUSTOMER_TYPE_LABELS } from '../utils/constants';
import { extractApiError } from '../utils/errorUtils';
import ErrorAlert from '../components/common/ErrorAlert';

const Customers = () => {
  const { isSaleRep, isSuperAdmin } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [error, setError] = useState(null);
  const [listError, setListError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    country: '',
    type: 'customer',
    status: 'active',
  });

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      setListError(null);
      const response = await customersAPI.getAll({ page, limit: 20, search, sortBy, sortOrder });
      setCustomers(response.data.data || []);
      setPagination(response.data.pagination || { total: 0, totalPages: 1 });
    } catch (err) {
      setListError(extractApiError(err, 'Failed to load customers'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [page, search, sortBy, sortOrder]);

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortBy(field);
      setSortOrder('ASC');
    }
  };

  const handleOpenModal = (customer = null) => {
    if (customer) {
      setSelectedCustomer(customer);
      setFormData({
        name: customer.name,
        email: customer.email || '',
        phone: customer.phone || '',
        address: customer.address || '',
        city: customer.city || '',
        country: customer.country || '',
        type: customer.type || 'customer',
        status: customer.status || 'active',
      });
    } else {
      setSelectedCustomer(null);
      setFormData({ name: '', email: '', phone: '', address: '', city: '', country: '', type: 'customer', status: 'active' });
    }
    setError(null);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    try {
      if (selectedCustomer) {
        await customersAPI.update(selectedCustomer.id, formData);
      } else {
        await customersAPI.create(formData);
      }
      setShowModal(false);
      fetchCustomers();
    } catch (err) {
      setError(extractApiError(err, 'Operation failed'));
    }
  };

  const handleToggleStatus = async (customer) => {
    try {
      await customersAPI.toggleStatus(customer.id);
      fetchCustomers();
    } catch (err) {
      console.error('Error toggling status:', err);
    }
  };

  const handleDelete = async () => {
    try {
      await customersAPI.delete(selectedCustomer.id);
      setShowDeleteModal(false);
      fetchCustomers();
    } catch (err) {
      setError(extractApiError(err, 'Delete failed'));
    }
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      const response = await customersAPI.exportCSV({ search });

      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `customers-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting customers:', error);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>Customers</h2>
        <div className="d-flex gap-2">
          {customers.length > 0 && (
            <Button variant="success" onClick={handleExport} disabled={exporting}>
              <FaFileExport className="me-2" />
              {exporting ? 'Exporting...' : 'Export to CSV'}
            </Button>
          )}
          {!isSaleRep() && (
            <>
              <Button variant="outline-primary" onClick={() => setShowImportModal(true)}>
                <FaFileImport className="me-2" />
                Import CSV
              </Button>
              <Button variant="primary" onClick={() => handleOpenModal()}>
                <FaPlus className="me-2" />
                Add Customer
              </Button>
            </>
          )}
        </div>
      </div>

      <Card>
        <Card.Header>
          <SearchBar value={search} onChange={setSearch} placeholder="Search customers..." />
        </Card.Header>
        <Card.Body>
          <ErrorAlert error={listError} />
          {loading ? (
            <div className="text-center py-4">
              <Spinner animation="border" variant="primary" />
            </div>
          ) : (
            <Table striped hover responsive>
              <thead>
                <tr>
                  <SortableHeader label="Name" field="name" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Type" field="type" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Email" field="email" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Phone" field="phone" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="City" field="city" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Status" field="status" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id}>
                    <td>{customer.name}</td>
                    <td>
                      <Badge bg={customer.type === 'supplier' ? 'info' : customer.type === 'both' ? 'primary' : 'success'}>
                        {CUSTOMER_TYPE_LABELS[customer.type] || 'Customer'}
                      </Badge>
                    </td>
                    <td>{customer.email || '-'}</td>
                    <td>{customer.phone || '-'}</td>
                    <td>{customer.city || '-'}</td>
                    <td>
                      <Badge bg={customer.status === 'active' ? 'success' : 'secondary'}>
                        {customer.status === 'active' ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td>
                      {!isSaleRep() && (
                        <>
                          <Button variant="outline-primary" size="sm" className="me-2" onClick={() => handleOpenModal(customer)}>
                            <FaEdit />
                          </Button>
                          <Button
                            variant={customer.status === 'active' ? 'outline-warning' : 'outline-success'}
                            size="sm"
                            className="me-2"
                            onClick={() => handleToggleStatus(customer)}
                            title={customer.status === 'active' ? 'Deactivate' : 'Activate'}
                          >
                            {customer.status === 'active' ? <FaToggleOff /> : <FaToggleOn />}
                          </Button>
                          {isSuperAdmin() && (
                            <Button variant="outline-danger" size="sm" onClick={() => { setSelectedCustomer(customer); setShowDeleteModal(true); }}>
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
          <span className="text-muted">Total: {pagination.total} customers</span>
          <Pagination currentPage={page} totalPages={pagination.totalPages} onPageChange={setPage} />
        </Card.Footer>
      </Card>

      <Modal show={showModal} onHide={() => setShowModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>{selectedCustomer ? 'Edit Customer' : 'Add Customer'}</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            <ErrorAlert error={error} />
            <div className="row">
              <div className="col-md-6">
                <Form.Group className="mb-3">
                  <Form.Label>Name *</Form.Label>
                  <Form.Control type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                </Form.Group>
              </div>
              <div className="col-md-6">
                <Form.Group className="mb-3">
                  <Form.Label>Email</Form.Label>
                  <Form.Control type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                </Form.Group>
              </div>
              <div className="col-md-6">
                <Form.Group className="mb-3">
                  <Form.Label>Phone</Form.Label>
                  <Form.Control type="text" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                </Form.Group>
              </div>
              <div className="col-md-6">
                <Form.Group className="mb-3">
                  <Form.Label>City</Form.Label>
                  <Form.Control type="text" value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} />
                </Form.Group>
              </div>
              <div className="col-md-6">
                <Form.Group className="mb-3">
                  <Form.Label>Country</Form.Label>
                  <Form.Control type="text" value={formData.country} onChange={(e) => setFormData({ ...formData, country: e.target.value })} />
                </Form.Group>
              </div>
              <div className="col-md-6">
                <Form.Group className="mb-3">
                  <Form.Label>Type *</Form.Label>
                  <Form.Select value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })}>
                    <option value={CUSTOMER_TYPES.CUSTOMER}>Customer</option>
                    <option value={CUSTOMER_TYPES.SUPPLIER}>Supplier</option>
                    <option value={CUSTOMER_TYPES.BOTH}>Both (Customer & Supplier)</option>
                  </Form.Select>
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
                  <Form.Label>Address</Form.Label>
                  <Form.Control as="textarea" rows={2} value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
                </Form.Group>
              </div>
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button variant="primary" type="submit">{selectedCustomer ? 'Update' : 'Create'}</Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <ConfirmModal
        show={showDeleteModal}
        onHide={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        title="Delete Customer"
        message={`Are you sure you want to delete ${selectedCustomer?.name}?`}
      />

      <ImportCsvModal
        show={showImportModal}
        onHide={() => setShowImportModal(false)}
        title="Import Customers"
        templateHeaders={['Name', 'Email', 'Phone', 'Address', 'City', 'Country', 'Type']}
        templateRow={['Acme Corp', 'contact@acme.com', '+1 555 0100', '123 Main St', 'New York', 'USA', 'customer']}
        templateFilename="customers-template.csv"
        onImport={(file) => customersAPI.importCSV(file)}
        onImported={fetchCustomers}
      />
    </div>
  );
};

export default Customers;
