import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { authApi } from '../../../api';
import { useAuth } from '../../../contexts/AuthContext';
import {
  PASSWORD_POLICY_HINT,
  validatePasswordPolicy,
} from '../../../shared/utils/passwordPolicy';

export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const profilePath = location.pathname.startsWith('/admin/') ? '/admin/profile' : '/profile';
  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
    setSuccess('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.currentPassword || !form.newPassword || !form.confirmPassword) {
      setError('Vui lòng nhập đầy đủ các trường');
      return;
    }

    if (form.newPassword !== form.confirmPassword) {
      setError('Mật khẩu mới và xác nhận mật khẩu không trùng khớp');
      return;
    }

    const policyError = validatePasswordPolicy(form.newPassword);
    if (policyError) {
      setError(policyError);
      return;
    }

    if (form.currentPassword === form.newPassword) {
      setError('Mật khẩu mới phải khác mật khẩu hiện tại');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await authApi.changePassword(form);
      setSuccess('Đổi mật khẩu thành công. Vui lòng đăng nhập lại.');
      setTimeout(async () => {
        await logout();
        navigate('/login');
      }, 1500);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setError(error.response?.data?.message || 'Đổi mật khẩu thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="top-bar">
        <h1>Đổi mật khẩu</h1>
        <button className="btn btn-secondary" onClick={() => navigate(profilePath)}>
          Quay lại
        </button>
      </div>
      <div className="page-content">
        <div className="card" style={{ maxWidth: 480 }}>
          <div className="card-body">
            {error && <div className="alert alert-error">{error}</div>}
            {success && <div className="alert alert-success">{success}</div>}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="currentPassword">Mật khẩu hiện tại</label>
                <input
                  id="currentPassword"
                  name="currentPassword"
                  type="password"
                  value={form.currentPassword}
                  onChange={handleChange}
                  autoComplete="current-password"
                />
              </div>

              <div className="form-group">
                <label htmlFor="newPassword">Mật khẩu mới</label>
                <input
                  id="newPassword"
                  name="newPassword"
                  type="password"
                  value={form.newPassword}
                  onChange={handleChange}
                  autoComplete="new-password"
                />
                <small style={{ fontSize: 12, color: '#636e72' }}>
                  {PASSWORD_POLICY_HINT}
                </small>
              </div>

              <div className="form-group">
                <label htmlFor="confirmPassword">Xác nhận mật khẩu mới</label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  value={form.confirmPassword}
                  onChange={handleChange}
                  autoComplete="new-password"
                />
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => navigate(profilePath)}
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                  style={{ flex: 1 }}
                >
                  {loading ? 'Đang lưu...' : 'Đổi mật khẩu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
