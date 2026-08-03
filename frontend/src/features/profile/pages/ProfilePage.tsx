import { useState, useEffect } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { authApi } from '../../../api';
import { useAuth } from '../../../contexts/AuthContext';
import type { User } from '../../../types';

export default function ProfilePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const profilePath = location.pathname.startsWith('/admin/') ? '/admin/profile' : '/profile';
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) return;

    const loadProfile = async () => {
      try {
        const { data } = await authApi.getProfile();
        setUser(data.data!);
      } catch (err: unknown) {
        const apiError = err as { response?: { data?: { message?: string } } };
        setError(apiError.response?.data?.message || 'Không thể tải hồ sơ. Vui lòng thử lại.');
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [isAuthenticated]);

  const getStatusClass = (status: string) => {
    if (status === 'ACTIVE') return 'active';
    if (status === 'LOCKED') return 'locked';
    return 'inactive';
  };

  const STATUS_LABEL: Record<string, string> = {
    ACTIVE: 'Đang hoạt động',
    INACTIVE: 'Không hoạt động',
    LOCKED: 'Bị khóa',
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (loading) {
    return (
      <>
        <div className="top-bar"><h1>Hồ sơ của tôi</h1></div>
        <div className="page-content">
          <div className="loading-spinner"><div className="spinner" /></div>
        </div>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <div className="top-bar"><h1>Hồ sơ của tôi</h1></div>
        <div className="page-content">
          <div className="alert alert-error">{error || 'Không tìm thấy thông tin hồ sơ.'}</div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="top-bar">
        <h1>Hồ sơ của tôi</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-secondary"
            onClick={() => navigate(`${profilePath}/change-password`)}
          >
            Đổi mật khẩu
          </button>
          <button
            className="btn btn-primary"
            onClick={() => navigate(`${profilePath}/edit`)}
          >
            Chỉnh sửa hồ sơ
          </button>
        </div>
      </div>

      <div className="page-content">
        <div className="card">
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: 20,
                  fontWeight: 700,
                }}
              >
                {user.fullName
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2)}
              </div>
              <div>
                <h2 style={{ margin: 0 }}>{user.fullName}</h2>
                <span className={`status-badge ${getStatusClass(user.status)}`} style={{ marginTop: 4 }}>
                  {STATUS_LABEL[user.status] ?? user.status}
                </span>
              </div>
            </div>
          </div>
          <div className="card-body">
            <div className="user-detail-grid">
              <div className="detail-item">
                <label>Tên đăng nhập</label>
                <span>{user.username}</span>
              </div>
              <div className="detail-item">
                <label>Email</label>
                <span>{user.email}</span>
              </div>
              <div className="detail-item">
                <label>Họ và tên</label>
                <span>{user.fullName}</span>
              </div>
              <div className="detail-item">
                <label>Số điện thoại</label>
                <span>{user.phone || '—'}</span>
              </div>
              <div className="detail-item">
                <label>Vai trò</label>
                <span>
                  {user.roles.map((role: string) => (
                    <span key={role} className="role-badge">
                      {role}
                    </span>
                  ))}
                </span>
              </div>
              <div className="detail-item">
                <label>Đăng nhập lần đầu</label>
                <span>{user.isFirstLogin ? 'Có' : 'Không'}</span>
              </div>
              <div className="detail-item">
                <label>Lần đăng nhập cuối</label>
                <span>{formatDate(user.lastLogin)}</span>
              </div>
              <div className="detail-item">
                <label>Ngày tạo tài khoản</label>
                <span>{formatDate(user.createdAt)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
