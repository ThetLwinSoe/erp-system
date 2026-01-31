import { Navbar as BsNavbar, Container, Dropdown, Badge, Image } from 'react-bootstrap';
import { FaUser, FaSignOutAlt } from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { getStaticUrl } from '../../services/api';

const Navbar = () => {
  const { user, logout, isSuperAdmin, getCompanyName } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const companyLogo = user?.company?.logo ? getStaticUrl(user.company.logo) : null;

  return (
    <BsNavbar bg="dark" variant="dark" className="px-3">
      <Container fluid>
        <BsNavbar.Brand className="d-flex align-items-center">
          {!isSuperAdmin() && companyLogo && (
            <Image
              src={companyLogo}
              alt={getCompanyName()}
              width={32}
              height={32}
              roundedCircle
              className="me-2"
              style={{ objectFit: 'cover', border: '2px solid #495057' }}
            />
          )}
          ERP System
        </BsNavbar.Brand>
        {!isSuperAdmin() && getCompanyName() && (
          <div className="d-flex align-items-center text-light me-auto ms-3">
            <span className="text-secondary">|</span>
            <span className="ms-3">{getCompanyName()}</span>
          </div>
        )}
        {isSuperAdmin() && (
          <Badge bg="warning" text="dark" className="me-auto ms-3">
            Super Admin
          </Badge>
        )}
        <Dropdown align="end">
          <Dropdown.Toggle variant="dark" id="user-dropdown">
            <FaUser className="me-2" />
            {user?.name}
          </Dropdown.Toggle>
          <Dropdown.Menu>
            <Dropdown.Item disabled>
              <small className="text-muted">{user?.email}</small>
            </Dropdown.Item>
            <Dropdown.Item disabled>
              <small className="text-muted text-capitalize">Role: {user?.role}</small>
            </Dropdown.Item>
            {!isSuperAdmin() && user?.company?.name && (
              <Dropdown.Item disabled>
                <small className="text-muted">Company: {user.company.name}</small>
              </Dropdown.Item>
            )}
            <Dropdown.Divider />
            <Dropdown.Item onClick={handleLogout}>
              <FaSignOutAlt className="me-2" />
              Logout
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>
      </Container>
    </BsNavbar>
  );
};

export default Navbar;
