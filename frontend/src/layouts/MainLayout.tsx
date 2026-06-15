import { useState } from 'react';
import { NavLink, Outlet, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

function Sidebar() {
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
        <h2>Hệ thống DMS</h2>
        <p style={{ fontSize: 12, color: '#636e72', marginTop: 4 }}>Quản lý tài liệu</p>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-title">Chính</div>
        <NavLink
          to="/"
          end
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          <span>🏠</span> Bảng điều khiển
        </NavLink>
        <NavLink
          to="/profile"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          <span>👤</span> Hồ sơ cá nhân
        </NavLink>

        <div className="nav-section-title">Tài liệu</div>
        <NavLink
          to="/documents"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          <span>📄</span> Tất cả tài liệu
        </NavLink>
        {user?.roles?.includes('DOCUMENT_CLERK') && (
          <NavLink
            to="/documents/upload"
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <span>📤</span> Tải lên tài liệu
          </NavLink>
        )}
        {(user?.roles?.includes('DOCUMENT_CLERK') || user?.roles?.includes('ADMIN')) && (
          <NavLink
            to="/documents/archived"
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <span>📦</span> Hồ sơ lưu trữ
          </NavLink>
        )}
        <NavLink
          to="/incoming-documents"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          <span>&#128229;</span> Văn bản đến
        </NavLink>
        <div className="nav-item" style={{ opacity: 0.5, cursor: 'not-allowed' }}>
          <span>&#128230;</span> Văn bản đi
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

export default function MainLayout() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="main-layout">
      <Sidebar />
      <div className="content-area">
        <Outlet />
      </div>
    </div>
  );
}
