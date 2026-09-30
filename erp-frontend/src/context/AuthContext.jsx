import { createContext, useContext, useState } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

// useAuth is a hook, not a component; splitting it into its own file would
// mean updating every page that imports it from here, for a Fast Refresh
// nicety only.
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  // localStorage reads are synchronous, so the saved session can be read
  // directly as the initial state instead of via a mount effect - avoids an
  // extra render and the react-hooks/set-state-in-effect lint error.
  const [user, setUser] = useState(() => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    return token && savedUser ? JSON.parse(savedUser) : null;
  });
  const login = async (email, password) => {
    const response = await authAPI.login({ email, password });
    const { user, token } = response.data.data;

    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    setUser(user);

    return user;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const isSuperAdmin = () => user?.role === 'superadmin';
  const isAdmin = () => user?.role === 'admin' || user?.role === 'superadmin';
  const isManager = () => user?.role === 'manager' || user?.role === 'admin' || user?.role === 'superadmin';
  const isSaleRep = () => user?.role === 'sale_rep';
  const canAccessInventory = () => user?.role !== 'sale_rep';
  const canAccessPurchases = () => user?.role !== 'sale_rep';
  const canAccessSalesReturns = () => user?.role !== 'sale_rep';
  // Two independent per-tenant knobs: Company.creditControlEnabled
  // (superadmin-controlled) and User.creditControlAccess (tenant-Admin-
  // controlled, from the Users page) - admin-role users always pass the
  // second half, since they're the ones granting it to others; sale_rep
  // users never pass it, regardless of their own flag's value. Superadmin
  // always has access. Mirrors evaluateCreditControlAccess on the backend
  // (src/middleware/companyScope.js) - keep both in sync.
  const canAccessCreditControl = () =>
    isSuperAdmin() || (!!user?.company?.creditControlEnabled && user?.role !== 'sale_rep' && (user?.role === 'admin' || !!user?.creditControlAccess));
  const getCompanyId = () => user?.companyId;
  const getCompanyName = () => user?.company?.name;

  const value = {
    user,
    // Always false: restoring the session from localStorage above is
    // synchronous, so there's no longer an async gap for callers (e.g.
    // PrivateRoute) to show a loading state for.
    loading: false,
    login,
    logout,
    isSuperAdmin,
    isAdmin,
    isManager,
    isSaleRep,
    canAccessInventory,
    canAccessPurchases,
    canAccessSalesReturns,
    canAccessCreditControl,
    getCompanyId,
    getCompanyName,
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
