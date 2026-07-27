import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../../../api';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [form, setForm] = useState({ newPassword: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!token) {
      setError('Đường dẫn đặt lại mật khẩu không hợp lệ hoặc bị thiếu');
      return;
    }

    if (!form.newPassword || !form.confirmPassword) {
      setError('Vui lòng điền đầy đủ các trường');
      return;
    }

    if (form.newPassword !== form.confirmPassword) {
      setError('Mật khẩu mới và xác nhận mật khẩu không trùng khớp');
      return;
    }

    if (form.newPassword.length < 8 || !/[A-Z]/.test(form.newPassword) || !/[a-z]/.test(form.newPassword) || !/[0-9]/.test(form.newPassword)) {
      setError('Mật khẩu phải có ít nhất 8 ký tự, bao gồm chữ hoa, chữ thường và chữ số');
      return;
    }

    setLoading(true);
    try {
      await authApi.resetPassword({ ...form, token });
      setSuccess('Đặt lại mật khẩu thành công. Đang chuyển đến trang đăng nhập...');
      setTimeout(() => navigate('/login', { replace: true }), 1200);
    } catch (err: unknown) {
      const errorResponse = err as { response?: { data?: { message?: string } } };
      setError(errorResponse.response?.data?.message || 'Không thể đặt lại mật khẩu');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <img
        src="/logo-fptu.png"
        alt="Logo"
        className="login-logo"
        style={{ display: 'block', margin: '0 auto 1.5rem', maxWidth: '120px', height: 'auto' }}
      />
      <h1 className="login-title">Đặt mật khẩu mới</h1>
      <p className="subtitle">Hãy chọn một mật khẩu mạnh cho tài khoản DMS của bạn.</p>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="newPassword">Mật khẩu mới</label>
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            value={form.newPassword}
            onChange={(event) => {
              setForm((previous) => ({ ...previous, newPassword: event.target.value }));
              setError('');
            }}
            autoComplete="new-password"
          />
        </div>

        <div className="form-group">
          <label htmlFor="confirmPassword">Xác nhận mật khẩu mới</label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            value={form.confirmPassword}
            onChange={(event) => {
              setForm((previous) => ({ ...previous, confirmPassword: event.target.value }));
              setError('');
            }}
            autoComplete="new-password"
          />
        </div>

        <p className="password-hint">Ít nhất 8 ký tự, bao gồm chữ hoa, chữ thường và chữ số.</p>

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Đang lưu...' : 'Đặt lại mật khẩu'}
        </button>
      </form>

      <Link to="/login" className="auth-link">
        Quay lại trang đăng nhập
      </Link>
    </div>
  );
}
