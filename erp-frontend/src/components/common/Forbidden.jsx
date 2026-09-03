import { Card, Button } from 'react-bootstrap';
import { FaBan } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';

const Forbidden = () => {
  const navigate = useNavigate();
  return (
    <Card className="text-center py-5">
      <Card.Body>
        <FaBan size={48} className="text-danger mb-3" />
        <h4>Access Denied</h4>
        <p className="text-muted">You don't have permission to view this page.</p>
        <Button variant="primary" onClick={() => navigate('/')}>Back to Dashboard</Button>
      </Card.Body>
    </Card>
  );
};

export default Forbidden;
