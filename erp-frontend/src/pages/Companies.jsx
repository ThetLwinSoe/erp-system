import { useState, useEffect, useRef } from 'react';
import { Card, Table, Button, Modal, Form, Spinner, Badge, Image } from 'react-bootstrap';
import { FaPlus, FaEdit, FaTrash, FaEye, FaUpload, FaTimesCircle } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { companiesAPI, getStaticUrl } from '../services/api';
import SearchBar from '../components/common/SearchBar';
import useDebounce from '../hooks/useDebounce';
import Pagination from '../components/common/Pagination';
import ConfirmModal from '../components/common/ConfirmModal';
import { COMPANY_STATUS, COMPANY_STATUS_COLORS, CURRENCIES, CURRENCY_LABELS, SUBSCRIPTION_ALERT_DAYS } from '../utils/constants';
import { extractApiError } from '../utils/errorUtils';
import { getDaysRemaining } from '../utils/subscription';
import ErrorAlert from '../components/common/ErrorAlert';
import SortableHeader from '../components/common/SortableHeader';

const LOGO_MAX_SIZE = 2 * 1024 * 1024; // 2MB, must match backend's uploadLogo limit

const Companies = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [error, setError] = useState(null);
  const [logoError, setLogoError] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    status: COMPANY_STATUS.ACTIVE,
    currency: CURRENCIES.USD,
    subscriptionEndDate: '',
    createAdmin: false,
    adminName: '',
    adminEmail: '',
    adminPassword: '',
  });

  const fetchCompanies = async () => {
    try {
      setLoading(true);
      const response = await companiesAPI.getAll({ page, limit: 20, search, sortBy, sortOrder });
      setCompanies(response.data.data || []);
      setPagination(response.data.pagination || { total: 0, totalPages: 1 });
    } catch (error) {
      console.error('Error fetching companies:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, [page, debouncedSearch, sortBy, sortOrder]);

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortBy(field);
      setSortOrder('ASC');
    }
  };

  const handleOpenModal = (company = null) => {
    if (company) {
      setSelectedCompany(company);
      setFormData({
        name: company.name,
        address: company.address || '',
        phone: company.phone || '',
        email: company.email || '',
        status: company.status,
        currency: company.currency || CURRENCIES.USD,
        subscriptionEndDate: company.subscriptionEndDate || '',
        createAdmin: false,
        adminName: '',
        adminEmail: '',
        adminPassword: '',
      });
      setLogoPreview(company.logo ? getStaticUrl(company.logo) : null);
    } else {
      setSelectedCompany(null);
      setFormData({
        name: '',
        address: '',
        phone: '',
        email: '',
        status: COMPANY_STATUS.ACTIVE,
        currency: CURRENCIES.USD,
        subscriptionEndDate: '',
        createAdmin: false,
        adminName: '',
        adminEmail: '',
        adminPassword: '',
      });
      setLogoPreview(null);
    }
    setError(null);
    setLogoError(null);
    setShowModal(true);
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !selectedCompany) return;

    if (file.size > LOGO_MAX_SIZE) {
      setLogoError('File is too large. Maximum allowed size is 2MB.');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    const formData = new FormData();
    formData.append('logo', file);

    try {
      setUploading(true);
      setLogoError(null);
      const response = await companiesAPI.uploadLogo(selectedCompany.id, formData);
      setLogoPreview(getStaticUrl(response.data.data.logo));
      fetchCompanies();
    } catch (err) {
      setLogoError(extractApiError(err, 'Logo upload failed').message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteLogo = async () => {
    if (!selectedCompany) return;

    try {
      setUploading(true);
      setLogoError(null);
      await companiesAPI.deleteLogo(selectedCompany.id);
      setLogoPreview(null);
      fetchCompanies();
    } catch (err) {
      setLogoError(extractApiError(err, 'Logo delete failed').message);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    setSubmitting(true);

    try {
      const submitData = {
        name: formData.name,
        address: formData.address,
        phone: formData.phone,
        email: formData.email,
        status: formData.status,
        currency: formData.currency,
        subscriptionEndDate: formData.subscriptionEndDate || null,
      };

      if (!selectedCompany && formData.createAdmin) {
        submitData.adminUser = {
          name: formData.adminName,
          email: formData.adminEmail,
          password: formData.adminPassword,
        };
      }

      if (selectedCompany) {
        await companiesAPI.update(selectedCompany.id, submitData);
      } else {
        await companiesAPI.create(submitData);
      }
      setShowModal(false);
      fetchCompanies();
    } catch (err) {
      setError(extractApiError(err, 'Operation failed'));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleDelete = async (password) => {
    if (deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    try {
      await companiesAPI.delete(selectedCompany.id, password);
      setShowDeleteModal(false);
      fetchCompanies();
    } catch (err) {
      setError(extractApiError(err, 'Delete failed'));
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>Companies</h2>
        <Button variant="primary" onClick={() => handleOpenModal()}>
          <FaPlus className="me-2" />
          Add Company
        </Button>
      </div>

      <Card>
        <Card.Header>
          <SearchBar value={search} onChange={setSearch} placeholder="Search companies..." />
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
                  <th style={{ width: '60px' }}>Logo</th>
                  <SortableHeader label="Name" field="name" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Email" field="email" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Phone" field="phone" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Currency" field="currency" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Status" field="status" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Subscription End" field="subscriptionEndDate" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Created At" field="createdAt" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((company) => (
                  <tr key={company.id}>
                    <td>
                      {company.logo ? (
                        <Image
                          src={getStaticUrl(company.logo)}
                          alt={company.name}
                          width={40}
                          height={40}
                          roundedCircle
                          style={{ objectFit: 'cover' }}
                        />
                      ) : (
                        <div
                          className="bg-secondary text-white d-flex align-items-center justify-content-center rounded-circle"
                          style={{ width: 40, height: 40, fontSize: '14px' }}
                        >
                          {company.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </td>
                    <td>{company.name}</td>
                    <td>{company.email || '-'}</td>
                    <td>{company.phone || '-'}</td>
                    <td>{company.currency || 'USD'}</td>
                    <td>
                      <Badge bg={COMPANY_STATUS_COLORS[company.status]}>
                        {company.status}
                      </Badge>
                    </td>
                    <td>
                      {company.subscriptionEndDate ? (
                        (() => {
                          const daysRemaining = getDaysRemaining(company.subscriptionEndDate);
                          const isNearOrPast = daysRemaining <= SUBSCRIPTION_ALERT_DAYS;
                          return (
                            <span className={isNearOrPast ? (daysRemaining < 0 ? 'text-danger fw-semibold' : 'text-warning fw-semibold') : ''}>
                              {new Date(company.subscriptionEndDate + 'T00:00:00').toLocaleDateString()}
                            </span>
                          );
                        })()
                      ) : (
                        '-'
                      )}
                    </td>
                    <td>{new Date(company.createdAt).toLocaleDateString()}</td>
                    <td>
                      <Button
                        variant="outline-info"
                        size="sm"
                        className="me-2"
                        onClick={() => navigate(`/companies/${company.id}`)}
                        title="View Details"
                      >
                        <FaEye />
                      </Button>
                      <Button
                        variant="outline-primary"
                        size="sm"
                        className="me-2"
                        onClick={() => handleOpenModal(company)}
                        title="Edit"
                      >
                        <FaEdit />
                      </Button>
                      <Button
                        variant="outline-danger"
                        size="sm"
                        onClick={() => {
                          setError(null);
                          setSelectedCompany(company);
                          setShowDeleteModal(true);
                        }}
                        title="Delete"
                      >
                        <FaTrash />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
        <Card.Footer className="d-flex justify-content-between align-items-center">
          <span className="text-muted">Total: {pagination.total} companies</span>
          <Pagination currentPage={page} totalPages={pagination.totalPages} onPageChange={setPage} />
        </Card.Footer>
      </Card>

      <Modal show={showModal} onHide={() => setShowModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>{selectedCompany ? 'Edit Company' : 'Add Company'}</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            <ErrorAlert error={error} />
            <Form.Group className="mb-3">
              <Form.Label>Company Name *</Form.Label>
              <Form.Control
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Email</Form.Label>
              <Form.Control
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Phone</Form.Label>
              <Form.Control
                type="text"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Address</Form.Label>
              <Form.Control
                as="textarea"
                rows={2}
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Status</Form.Label>
              <Form.Select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              >
                <option value={COMPANY_STATUS.ACTIVE}>Active</option>
                <option value={COMPANY_STATUS.INACTIVE}>Inactive</option>
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Currency</Form.Label>
              <Form.Select
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
              >
                {Object.keys(CURRENCIES).map((key) => (
                  <option key={key} value={CURRENCIES[key]}>
                    {CURRENCY_LABELS[key]}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Subscription End Date</Form.Label>
              <Form.Control
                type="date"
                value={formData.subscriptionEndDate}
                onChange={(e) => setFormData({ ...formData, subscriptionEndDate: e.target.value })}
              />
              <Form.Text className="text-muted">
                Optional. Users at this company (and superadmin) see a warning starting {SUBSCRIPTION_ALERT_DAYS} days before this date.
              </Form.Text>
            </Form.Group>

            {selectedCompany && (
              <Form.Group className="mb-3">
                <Form.Label>Company Logo</Form.Label>
                <div className="d-flex align-items-center gap-3">
                  {logoPreview ? (
                    <div className="position-relative">
                      <Image
                        src={logoPreview}
                        alt="Company Logo"
                        width={80}
                        height={80}
                        roundedCircle
                        style={{ objectFit: 'cover', border: '2px solid #dee2e6' }}
                      />
                      <Button
                        variant="danger"
                        size="sm"
                        className="position-absolute top-0 end-0 rounded-circle p-0"
                        style={{ width: '24px', height: '24px' }}
                        onClick={handleDeleteLogo}
                        disabled={uploading}
                        title="Remove Logo"
                      >
                        <FaTimesCircle size={12} />
                      </Button>
                    </div>
                  ) : (
                    <div
                      className="bg-light d-flex align-items-center justify-content-center rounded-circle"
                      style={{ width: 80, height: 80, border: '2px dashed #dee2e6' }}
                    >
                      <span className="text-muted">No Logo</span>
                    </div>
                  )}
                  <div>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleLogoUpload}
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      style={{ display: 'none' }}
                    />
                    <Button
                      variant="outline-primary"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      {uploading ? (
                        <Spinner animation="border" size="sm" />
                      ) : (
                        <>
                          <FaUpload className="me-1" />
                          Upload Logo
                        </>
                      )}
                    </Button>
                    <Form.Text className="d-block text-muted mt-1">
                      Max 2MB. JPEG, PNG, GIF, WebP
                    </Form.Text>
                    {logoError && (
                      <div className="text-danger small mt-1">{logoError}</div>
                    )}
                  </div>
                </div>
              </Form.Group>
            )}

            {!selectedCompany && (
              <>
                <hr />
                <Form.Group className="mb-3">
                  <Form.Check
                    type="checkbox"
                    label="Create Admin User for this company"
                    checked={formData.createAdmin}
                    onChange={(e) => setFormData({ ...formData, createAdmin: e.target.checked })}
                  />
                </Form.Group>

                {formData.createAdmin && (
                  <>
                    <Form.Group className="mb-3">
                      <Form.Label>Admin Name *</Form.Label>
                      <Form.Control
                        type="text"
                        value={formData.adminName}
                        onChange={(e) => setFormData({ ...formData, adminName: e.target.value })}
                        required={formData.createAdmin}
                      />
                    </Form.Group>
                    <Form.Group className="mb-3">
                      <Form.Label>Admin Email *</Form.Label>
                      <Form.Control
                        type="email"
                        value={formData.adminEmail}
                        onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
                        required={formData.createAdmin}
                      />
                    </Form.Group>
                    <Form.Group className="mb-3">
                      <Form.Label>Admin Password *</Form.Label>
                      <Form.Control
                        type="password"
                        value={formData.adminPassword}
                        onChange={(e) => setFormData({ ...formData, adminPassword: e.target.value })}
                        required={formData.createAdmin}
                      />
                    </Form.Group>
                  </>
                )}
              </>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={submitting}>
              {submitting ? (selectedCompany ? 'Updating...' : 'Creating...') : (selectedCompany ? 'Update' : 'Create')}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <ConfirmModal
        show={showDeleteModal}
        onHide={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        title="Delete Company"
        message={`Are you sure you want to delete ${selectedCompany?.name}? This will also delete all associated data.`}
        error={error}
        requirePassword
        confirmDisabled={deleting}
        confirmText={deleting ? 'Deleting...' : 'Delete'}
      />
    </div>
  );
};

export default Companies;
