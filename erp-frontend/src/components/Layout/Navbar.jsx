import { Navbar as BsNavbar, Container, Dropdown } from 'react-bootstrap';
import { FaUser, FaSignOutAlt } from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <BsNavbar bg="dark" variant="dark" className="px-3">
      <Container fluid>
        <BsNavbar.Brand>ERP System</BsNavbar.Brand>
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
