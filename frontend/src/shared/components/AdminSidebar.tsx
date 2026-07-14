import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function AdminSidebar() {
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
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2>Quản trị DMS</h2>
        <p style={{ fontSize: 12, color: '#636e72', marginTop: 4 }}>Bảng điều khiển quản trị</p>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-title">Quản lý</div>
        <NavLink
          to="/admin"
          end
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          <span>🏠</span> Bảng điều khiển
        </NavLink>
        <NavLink
          to="/admin/users"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          <span>👥</span> Quản lý người dùng
        </NavLink>
        <NavLink
          to="/admin/roles"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          <span>🛡️</span> Quản lý vai trò
        </NavLink>
        <NavLink
          to="/admin/departments"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          <span>🏢</span> Quản lý phòng ban
        </NavLink>

      </nav>

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
          style={{ width: '100%', fontSize: 13, marginBottom: 8 }}
          onClick={() => navigate('/change-password')}
        >
          Đổi mật khẩu
        </button>
        <button
          className="btn btn-secondary"
          style={{ width: '100%', fontSize: 13 }}
          onClick={handleLogout}
        >
          Đăng xuất
        </button>
      </div>
    </aside>
  );
}
