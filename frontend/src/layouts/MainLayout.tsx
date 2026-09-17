import { useState, useEffect, useCallback } from 'react';
import { NavLink, Outlet, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getOutgoingUnprocessedCount } from '../api/modules/outgoing-documents';

interface LayoutContextValue {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
}

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { user, logout, isDepartmentHead, isSpecialist, isAdmin, isDocumentClerk } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [outgoingUnprocessedCount, setOutgoingUnprocessedCount] = useState(0);

  const fetchUnprocessedCount = useCallback(async () => {
    if (!user) return;
    try {
      const count = await getOutgoingUnprocessedCount();
      setOutgoingUnprocessedCount(count);
    } catch {
      // Ignore background error
    }
  }, [user]);

  useEffect(() => {
    fetchUnprocessedCount();
    const interval = setInterval(fetchUnprocessedCount, 15000);
    return () => clearInterval(interval);
  }, [fetchUnprocessedCount, location.pathname]);

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
            <h2>Hệ thống DMS</h2>
            <p style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.75)', marginTop: 4 }}>Quản lý tài liệu</p>
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
            {!isSpecialist && (
              <NavLink to="/" end className={({ isActive }) => `nav-item-icon ${isActive ? 'active' : ''}`} title="Bảng điều khiển">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
              </NavLink>
            )}
            <NavLink to="/profile" className={({ isActive }) => `nav-item-icon ${isActive ? 'active' : ''}`} title="Hồ sơ cá nhân">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </NavLink>


            <NavLink to="/incoming-documents" className={({ isActive }) => `nav-item-icon ${isActive ? 'active' : ''}`} title="Văn bản đến">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </NavLink>
            {isAdmin && (
              <NavLink to="/incoming-documents/pending" className={({ isActive }) => `nav-item-icon ${isActive ? 'active' : ''}`} title="Văn bản chờ xử lý">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </NavLink>
            )}
            <NavLink
              to="/outgoing-documents"
              className={({ isActive }) => `nav-item-icon ${isActive ? 'active' : ''}`}
              title="Văn bản đi"
              style={{ position: 'relative' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
              {outgoingUnprocessedCount > 0 && (
                <span className="sidebar-icon-badge-red">
                  {outgoingUnprocessedCount > 99 ? '99+' : outgoingUnprocessedCount}
                </span>
              )}
            </NavLink>
            {!isSpecialist && (
              <NavLink to="/documents/statistics" className={({ isActive }) => `nav-item-icon ${isActive ? 'active' : ''}`} title="Thống kê văn bản">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6"  y1="20" x2="6"  y2="14" />
                </svg>
              </NavLink>
            )}
            {(isDocumentClerk || isAdmin) && (
              <NavLink to="/document-books" className={({ isActive }) => `nav-item-icon ${isActive ? 'active' : ''}`} title="Quản lý sổ văn bản">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
              </NavLink>
            )}
            {isDocumentClerk && (
              <>
                <NavLink to="/document-categories" className={({ isActive }) => `nav-item-icon ${isActive ? 'active' : ''}`} title="Quản lý lĩnh vực văn bản">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                </NavLink>
                <NavLink to="/document-types" className={({ isActive }) => `nav-item-icon ${isActive ? 'active' : ''}`} title="Quản lý thể loại văn bản">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                </NavLink>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="nav-section-title">Chính</div>
            {!isSpecialist && (
              <NavLink to="/" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
                Bảng điều khiển
              </NavLink>
            )}
            <NavLink to="/profile" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              Hồ sơ cá nhân
            </NavLink>

            <div className="nav-section-title">Tài liệu</div>

            <NavLink to="/incoming-documents" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              Văn bản đến
            </NavLink>
            {isAdmin && (
              <NavLink to="/incoming-documents/pending" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                Văn bản chờ xử lý
              </NavLink>
            )}
            <NavLink to="/outgoing-documents" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
              <span>Văn bản đi</span>
              {outgoingUnprocessedCount > 0 && (
                <span className="sidebar-badge-red">
                  {outgoingUnprocessedCount > 99 ? '99+' : outgoingUnprocessedCount}
                </span>
              )}
            </NavLink>
            {!isSpecialist && (
              <NavLink to="/documents/statistics" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6"  y1="20" x2="6"  y2="14" />
                </svg>
                Thống kê văn bản
              </NavLink>
            )}
            {(isDocumentClerk || isAdmin) && (
              <NavLink to="/document-books" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
                Quản lý sổ văn bản
              </NavLink>
            )}
            {isDocumentClerk && (
              <>
                <NavLink to="/document-categories" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                  Quản lý lĩnh vực văn bản
                </NavLink>
                <NavLink to="/document-types" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                  Quản lý thể loại văn bản
                </NavLink>
              </>
            )}
          </>
        )}
      </nav>

      {!collapsed && (
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

export default function MainLayout() {
  const { isAuthenticated, isDocumentClerk, isAdmin } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const layoutContext: LayoutContextValue = {
    sidebarCollapsed,
    setSidebarCollapsed,
  };

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className={`main-layout ${sidebarCollapsed ? 'layout--sidebar-collapsed' : ''}`}>
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((c) => !c)} />
      <div className="content-area">
        <Outlet context={layoutContext} />
      </div>
    </div>
  );
}

export type { LayoutContextValue };
