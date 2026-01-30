import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Row, Col, Badge, Button, Table, Spinner, Alert, Modal, Form } from 'react-bootstrap';
import { FaArrowLeft, FaBuilding, FaUsers, FaBoxes, FaShoppingCart, FaTruck, FaPlus } from 'react-icons/fa';
import { companiesAPI, usersAPI } from '../services/api';
import { COMPANY_STATUS_COLORS, ROLES } from '../utils/constants';

const CompanyDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [company, setCompany] = useState(null);
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showUserModal, setShowUserModal] = useState(false);
  const [userFormData, setUserFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'staff',
  });
  const [userError, setUserError] = useState('');

  const fetchCompanyData = async () => {
    try {
      setLoading(true);
      const [companyRes, usersRes, statsRes] = await Promise.all([
        companiesAPI.getById(id),
        companiesAPI.getUsers(id),
        companiesAPI.getStats(id),
      ]);
      setCompany(companyRes.data.data);
      setUsers(usersRes.data.data || []);
      setStats(statsRes.data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load company details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanyData();
  }, [id]);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setUserError('');

    try {
      await usersAPI.create({
        ...userFormData,
        companyId: parseInt(id),
      });
      setShowUserModal(false);
      setUserFormData({ name: '', email: '', password: '', role: 'staff' });
      fetchCompanyData();
    } catch (err) {
      setUserError(err.response?.data?.message || 'Failed to create user');
    }
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" variant="primary" />
      </div>
    );
  }

  if (error) {
    return <Alert variant="danger">{error}</Alert>;
  }

  return (
    <div>
      <Button variant="outline-secondary" onClick={() => navigate('/companies')} className="mb-3">
        <FaArrowLeft className="me-2" />
        Back to Companies
      </Button>

      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>
          <FaBuilding className="me-2" />
          {company?.name}
        </h2>
        <Badge bg={COMPANY_STATUS_COLORS[company?.status]} className="fs-6">
          {company?.status}
        </Badge>
      </div>

      {/* Company Info */}
      <Card className="mb-4">
        <Card.Header>
          <h5 className="mb-0">Company Information</h5>
        </Card.Header>
        <Card.Body>
          <Row>
            <Col md={6}>
              <p><strong>Email:</strong> {company?.email || '-'}</p>
              <p><strong>Phone:</strong> {company?.phone || '-'}</p>
            </Col>
            <Col md={6}>
              <p><strong>Address:</strong> {company?.address || '-'}</p>
              <p><strong>Created:</strong> {new Date(company?.createdAt).toLocaleDateString()}</p>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {/* Statistics */}
      {stats && (
        <Row className="mb-4">
          <Col md={3}>
            <Card className="text-center">
              <Card.Body>
                <FaUsers size={30} className="text-primary mb-2" />
                <h3>{stats.users}</h3>
                <p className="text-muted mb-0">Users</p>
              </Card.Body>
            </Card>
          </Col>
          <Col md={3}>
            <Card className="text-center">
              <Card.Body>
                <FaBoxes size={30} className="text-success mb-2" />
                <h3>{stats.products}</h3>
                <p className="text-muted mb-0">Products</p>
              </Card.Body>
            </Card>
          </Col>
          <Col md={3}>
            <Card className="text-center">
              <Card.Body>
                <FaShoppingCart size={30} className="text-info mb-2" />
                <h3>{stats.sales}</h3>
                <p className="text-muted mb-0">Sales</p>
              </Card.Body>
            </Card>
          </Col>
          <Col md={3}>
            <Card className="text-center">
              <Card.Body>
                <FaTruck size={30} className="text-warning mb-2" />
                <h3>{stats.purchases}</h3>
                <p className="text-muted mb-0">Purchases</p>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      )}

      {/* Users */}
      <Card>
        <Card.Header className="d-flex justify-content-between align-items-center">
          <h5 className="mb-0">Users</h5>
          <Button variant="primary" size="sm" onClick={() => setShowUserModal(true)}>
            <FaPlus className="me-1" />
            Add User
          </Button>
        </Card.Header>
        <Card.Body>
          <Table striped hover responsive>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Created At</th>
              </tr>
            </thead>
            <tbody>
              {users.length > 0 ? (
                users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.name}</td>
                    <td>{user.email}</td>
                    <td className="text-capitalize">{user.role}</td>
                    <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="text-center text-muted">
                    No users found
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </Card.Body>
      </Card>

      {/* Add User Modal */}
      <Modal show={showUserModal} onHide={() => setShowUserModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Add User to {company?.name}</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleCreateUser}>
          <Modal.Body>
            {userError && <Alert variant="danger">{userError}</Alert>}
            <Form.Group className="mb-3">
              <Form.Label>Name *</Form.Label>
              <Form.Control
                type="text"
                value={userFormData.name}
                onChange={(e) => setUserFormData({ ...userFormData, name: e.target.value })}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Email *</Form.Label>
              <Form.Control
                type="email"
                value={userFormData.email}
                onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Password *</Form.Label>
              <Form.Control
                type="password"
                value={userFormData.password}
                onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Role</Form.Label>
              <Form.Select
                value={userFormData.role}
                onChange={(e) => setUserFormData({ ...userFormData, role: e.target.value })}
              >
                <option value={ROLES.STAFF}>Staff</option>
                <option value={ROLES.MANAGER}>Manager</option>
                <option value={ROLES.ADMIN}>Admin</option>
              </Form.Select>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowUserModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              Create User
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
};

export default CompanyDetails;
