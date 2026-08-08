import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Shield, Users } from 'lucide-react';
import { useDepartments, useRoles, useUsers } from '../../../shared/hooks';
import { useAuth } from '../../../contexts/AuthContext';
import { LoadingSpinner } from '../../../shared/components';

const summaryCards = [
  {
    key: 'users',
    title: 'Tổng số người dùng',
    href: '/admin/users',
    icon: Users,
    className: 'admin-summary-card--users',
  },
  {
    key: 'roles',
    title: 'Tổng số vai trò',
    href: '/admin/roles',
    icon: Shield,
    className: 'admin-summary-card--roles',
  },
  {
    key: 'departments',
    title: 'Tổng số phòng ban',
    href: '/admin/departments',
    icon: Building2,
    className: 'admin-summary-card--departments',
  },
] as const;

export default function AdminDashboardPage() {
  const { isAdmin } = useAuth();
  const users = useUsers({ pageSize: 1 });
  const roles = useRoles();
  const departments = useDepartments();

  useEffect(() => {
    users.fetch();
  }, [users.fetch]);

  if (!isAdmin) {
    return <div className="page-content"><p>Truy cập bị từ chối.</p></div>;
  }

  const loading = users.loading || roles.loading || departments.loading;
  const error = users.error || roles.error || departments.error;
  const values = {
    users: users.total,
    roles: roles.roles.length,
    departments: departments.departments.length,
  };

  return (
    <>
      <div className="top-bar">
        <div>
          <h1>Trang chủ hệ thống quản lý tài liệu</h1>
          <p className="admin-dashboard-subtitle">Tổng quan hệ thống quản lý tài liệu</p>
        </div>
      </div>
      <div className="page-content">
        {error && (
          <div className="alert alert-error" role="alert">
            Không thể tải dữ liệu tổng quan. Vui lòng thử lại sau.
          </div>
        )}
        {loading ? (
          <div className="card admin-dashboard-loading"><LoadingSpinner /></div>
        ) : (
          <div className="admin-summary-grid">
            {summaryCards.map(({ key, title, href, icon: Icon, className }) => (
              <Link key={key} to={href} className={`card admin-summary-card ${className}`}>
                <div className="admin-summary-card__icon"><Icon size={26} strokeWidth={2} /></div>
                <div className="admin-summary-card__content">
                  <span className="admin-summary-card__title">{title}</span>
                  <strong className="admin-summary-card__value">{values[key].toLocaleString()}</strong>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
