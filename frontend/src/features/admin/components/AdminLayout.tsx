import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import AdminSidebar from '../components/AdminSidebar';

export default function AdminLayout() {
  const { isAuthenticated, isAdmin } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="main-layout">
      <AdminSidebar />
      <div className="content-area">
        <Outlet />
      </div>
    </div>
  );
}
