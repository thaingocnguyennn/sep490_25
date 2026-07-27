import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function AuthLayout() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (isAuthenticated && location.pathname === '/login') {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="page-container">
      <div className="auth-card">
        <Outlet />
      </div>
    </div>
  );
}
