import { Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Forbidden from './common/Forbidden';

const RoleRoute = ({ allowedRoles }) => {
  const { user } = useAuth();
  return allowedRoles.includes(user?.role) ? <Outlet /> : <Forbidden />;
};

export default RoleRoute;
