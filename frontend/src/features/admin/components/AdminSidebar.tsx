import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';

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
        <h2>DMS Admin</h2>
        <p style={{ fontSize: 12, color: '#636e72', marginTop: 4 }}>Management Console</p>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-title">Management</div>
        <NavLink
          to="/admin"
          end
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          <span>🏠</span> Dashboard
        </NavLink>
        <NavLink
          to="/admin/users"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          <span>👥</span> User Management
        </NavLink>

        <div className="nav-section-title">Documents</div>
        <div className="nav-item" style={{ opacity: 0.5, cursor: 'not-allowed' }}>
          <span>📄</span> Documents
        </div>
        <div className="nav-item" style={{ opacity: 0.5, cursor: 'not-allowed' }}>
          <span>📥</span> Incoming Docs
        </div>
        <div className="nav-item" style={{ opacity: 0.5, cursor: 'not-allowed' }}>
          <span>📤</span> Outgoing Docs
        </div>
      </nav>

      <div className="sidebar-footer">
        <div className="user-info">
          <div className="user-avatar">{getInitials(user?.fullName || '')}</div>
          <div>
            <div className="user-name">{user?.fullName}</div>
            <div className="user-role">{user?.roles?.[0] || 'User'}</div>
          </div>
        </div>
        <button
          className="btn btn-secondary"
          style={{ width: '100%', fontSize: 13, marginBottom: 8 }}
          onClick={() => navigate('/change-password')}
        >
          Change Password
        </button>
        <button
          className="btn btn-secondary"
          style={{ width: '100%', fontSize: 13 }}
          onClick={handleLogout}
        >
          Logout
        </button>
      </div>
    </aside>
  );
}
