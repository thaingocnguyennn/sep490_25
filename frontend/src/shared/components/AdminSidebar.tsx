import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface AdminSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function AdminSidebar({ collapsed, onToggle }: AdminSidebarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`}>
      <div className="sidebar-header">
        {!collapsed && (
          <>
            <h2>Quản trị DMS</h2>
            <p style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.75)', marginTop: 4 }}>Bảng điều khiển</p>
          </>
        )}
        <button
          type="button"
          className="sidebar-collapse-btn"
          onClick={onToggle}
          title={collapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {collapsed ? (
              <polyline points="9 18 15 12 9 6" />
            ) : (
              <polyline points="15 18 9 12 15 6" />
            )}
          </svg>
        </button>
      </div>

      <nav className="sidebar-nav">
        {collapsed ? (
          <div className="sidebar-nav-icons">
            <NavLink to="/admin" end className={({ isActive }) => `nav-item-icon ${isActive ? 'active' : ''}`} title="Trang chủ">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m3 11 9-8 9 8" />
                <path d="M5 10v10h14V10" />
                <path d="M9 20v-6h6v6" />
              </svg>
            </NavLink>
            <NavLink to="/admin/profile" className={({ isActive }) => `nav-item-icon ${isActive ? 'active' : ''}`} title="Hồ sơ của tôi">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </NavLink>
            <NavLink to="/admin/users" className={({ isActive }) => `nav-item-icon ${isActive ? 'active' : ''}`} title="Quản lý người dùng">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </NavLink>
            <NavLink to="/admin/roles" className={({ isActive }) => `nav-item-icon ${isActive ? 'active' : ''}`} title="Quản lý vai trò">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </NavLink>
            <NavLink to="/admin/departments" className={({ isActive }) => `nav-item-icon ${isActive ? 'active' : ''}`} title="Quản lý phòng ban">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 21h18" />
                <path d="M5 21V7l8-4v18" />
                <path d="M19 21V11l-6-4" />
                <path d="M9 9v.01" />
                <path d="M9 12v.01" />
                <path d="M9 15v.01" />
                <path d="M9 18v.01" />
              </svg>
            </NavLink>
          </div>
        ) : (
          <>
            <NavLink
              to="/admin"
              end
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m3 11 9-8 9 8" />
                <path d="M5 10v10h14V10" />
                <path d="M9 20v-6h6v6" />
              </svg>
              Trang chủ
            </NavLink>
            <div className="nav-section-title">Tài khoản</div>
            <NavLink
              to="/admin/profile"
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              Hồ sơ của tôi
            </NavLink>
            <div className="nav-section-title">Quản lý</div>
            <NavLink
              to="/admin/users"
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              Quản lý người dùng
            </NavLink>
            <NavLink
              to="/admin/roles"
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              Quản lý vai trò
            </NavLink>
            <NavLink
              to="/admin/departments"
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 21h18" />
                <path d="M5 21V7l8-4v18" />
                <path d="M19 21V11l-6-4" />
                <path d="M9 9v.01" />
                <path d="M9 12v.01" />
                <path d="M9 15v.01" />
                <path d="M9 18v.01" />
              </svg>
              Quản lý phòng ban
            </NavLink>
          </>
        )}
      </nav>

      {!collapsed && (
        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">{getInitials(user?.fullName || '')}</div>
            <div>
              <div className="user-name">{user?.fullName}</div>
              <div className="user-role">{user?.roles?.[0] || 'Người dùng'}</div>
            </div>
          </div>
          <button
            className="btn btn-secondary"
            style={{ width: '100%', fontSize: 13 }}
            onClick={handleLogout}
          >
            Đăng xuất
          </button>
        </div>
      )}
    </aside>
  );
}
