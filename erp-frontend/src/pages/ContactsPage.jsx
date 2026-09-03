import { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Spinner, Badge } from 'react-bootstrap';
import { FaPlus, FaEdit, FaTrash, FaToggleOn, FaToggleOff, FaFileExport, FaFileImport } from 'react-icons/fa';
import { customersAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import SearchBar from '../components/common/SearchBar';
import useDebounce from '../hooks/useDebounce';
import Pagination from '../components/common/Pagination';
import ConfirmModal from '../components/common/ConfirmModal';
import ImportCsvModal from '../components/common/ImportCsvModal';
import SortableHeader from '../components/common/SortableHeader';
import { extractApiError } from '../utils/errorUtils';
import ErrorAlert from '../components/common/ErrorAlert';

const TEMPLATE_EXAMPLES = {
  customer: ['Acme Corp', 'contact@acme.com', '+1 555 0100', '123 Main St', 'New York', 'USA'],
  supplier: ['Global Supplies Inc.', 'sales@globalsupplies.com', '+1 555 0200', '456 Industrial Ave', 'Chicago', 'USA'],
};

/**
 * Shared list/CRUD page for Customer-table contacts, scoped to a single type
 * (Customers page passes type="customer", Suppliers page passes type="supplier").
 */
const ContactsPage = ({ type, label, labelPlural }) => {
  const { isSaleRep, isSuperAdmin } = useAuth();
  const labelLower = labelPlural.toLowerCase();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedContact, setSelectedContact] = useState(null);
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
    status: 'active',
  });

  const fetchContacts = async () => {
    try {
      setLoading(true);
      setListError(null);
      const response = await customersAPI.getAll({ page, limit: 20, search, sortBy, sortOrder, type });
      setContacts(response.data.data || []);
      setPagination(response.data.pagination || { total: 0, totalPages: 1 });
    } catch (err) {
      setListError(extractApiError(err, `Failed to load ${labelLower}`));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearch, sortBy, sortOrder, type]);

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortBy(field);
      setSortOrder('ASC');
    }
  };

  const handleOpenModal = (contact = null) => {
    if (contact) {
      setSelectedContact(contact);
      setFormData({
        name: contact.name,
        email: contact.email || '',
        phone: contact.phone || '',
        address: contact.address || '',
        city: contact.city || '',
        country: contact.country || '',
        status: contact.status || 'active',
      });
    } else {
      setSelectedContact(null);
      setFormData({ name: '', email: '', phone: '', address: '', city: '', country: '', status: 'active' });
    }
    setError(null);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    try {
      if (selectedContact) {
        // type is intentionally omitted on update so editing never changes an
        // existing record's type (e.g. downgrades a legacy "Both" record)
        await customersAPI.update(selectedContact.id, formData);
      } else {
        await customersAPI.create({ ...formData, type });
      }
      setShowModal(false);
      fetchContacts();
    } catch (err) {
      setError(extractApiError(err, 'Operation failed'));
    }
  };

  const handleToggleStatus = async (contact) => {
    try {
      await customersAPI.toggleStatus(contact.id);
      fetchContacts();
    } catch (err) {
      console.error(`Error toggling ${label.toLowerCase()} status:`, err);
    }
  };

  const handleDelete = async () => {
    try {
      await customersAPI.delete(selectedContact.id);
      setShowDeleteModal(false);
      fetchContacts();
    } catch (err) {
      setError(extractApiError(err, 'Delete failed'));
    }
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      const response = await customersAPI.exportCSV({ search, type });

      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${labelLower}-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(`Error exporting ${labelLower}:`, err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>{labelPlural}</h2>
        <div className="d-flex gap-2">
          {contacts.length > 0 && (
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
                Add {label}
              </Button>
            </>
          )}
        </div>
      </div>

      <Card>
        <Card.Header>
          <SearchBar value={search} onChange={setSearch} placeholder={`Search ${labelLower}...`} />
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
                  <SortableHeader label="Email" field="email" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Phone" field="phone" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="City" field="city" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Status" field="status" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => (
                  <tr key={contact.id}>
                    <td>{contact.name}</td>
                    <td>{contact.email || '-'}</td>
                    <td>{contact.phone || '-'}</td>
                    <td>{contact.city || '-'}</td>
                    <td>
                      <Badge bg={contact.status === 'active' ? 'success' : 'secondary'}>
                        {contact.status === 'active' ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td>
                      {!isSaleRep() && (
                        <>
                          <Button variant="outline-primary" size="sm" className="me-2" onClick={() => handleOpenModal(contact)}>
                            <FaEdit />
                          </Button>
                          <Button
                            variant={contact.status === 'active' ? 'outline-warning' : 'outline-success'}
                            size="sm"
                            className="me-2"
                            onClick={() => handleToggleStatus(contact)}
                            title={contact.status === 'active' ? 'Deactivate' : 'Activate'}
                          >
                            {contact.status === 'active' ? <FaToggleOff /> : <FaToggleOn />}
                          </Button>
                          {isSuperAdmin() && (
                            <Button variant="outline-danger" size="sm" onClick={() => { setError(null); setSelectedContact(contact); setShowDeleteModal(true); }}>
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
          <span className="text-muted">Total: {pagination.total} {labelLower}</span>
          <Pagination currentPage={page} totalPages={pagination.totalPages} onPageChange={setPage} />
        </Card.Footer>
      </Card>

      <Modal show={showModal} onHide={() => setShowModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>{selectedContact ? `Edit ${label}` : `Add ${label}`}</Modal.Title>
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
            <Button variant="primary" type="submit">{selectedContact ? 'Update' : 'Create'}</Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <ConfirmModal
        show={showDeleteModal}
        onHide={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        title={`Delete ${label}`}
        message={`Are you sure you want to delete ${selectedContact?.name}?`}
        error={error}
      />

      <ImportCsvModal
        show={showImportModal}
        onHide={() => setShowImportModal(false)}
        title={`Import ${labelPlural}`}
        templateHeaders={['Name', 'Email', 'Phone', 'Address', 'City', 'Country']}
        templateRow={TEMPLATE_EXAMPLES[type]}
        templateFilename={`${labelLower}-template.csv`}
        onImport={(file) => customersAPI.importCSV(file, type)}
        onImported={fetchContacts}
      />
    </div>
  );
};

export default ContactsPage;
