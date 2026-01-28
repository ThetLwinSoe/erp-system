import { Badge } from 'react-bootstrap';
import { STATUS_COLORS } from '../../utils/constants';

const StatusBadge = ({ status }) => {
  const color = STATUS_COLORS[status] || 'secondary';

  return (
    <Badge bg={color} className="text-capitalize">
      {status}
    </Badge>
  );
};

export default StatusBadge;
