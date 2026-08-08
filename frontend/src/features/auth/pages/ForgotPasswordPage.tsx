import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../../../api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!email.trim()) {
      setError('Vui lòng nhập địa chỉ email');
      return;
    }

    setLoading(true);
    try {
      const response = await authApi.forgotPassword({ email: email.trim() });
      setSuccess(response.data.message);
    } catch (err: unknown) {
      const errorResponse = err as { response?: { data?: { message?: string } } };
      setError(errorResponse.response?.data?.message || 'Không thể gửi email đặt lại mật khẩu');
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
      <h1 className="login-title">Quên mật khẩu?</h1>
      <p className="subtitle">
        Nhập email tài khoản của bạn, chúng tôi sẽ gửi cho bạn đường dẫn để đặt lại mật khẩu.
      </p>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="email">Địa chỉ email</label>
          <input
            id="email"
            name="email"
            type="email"
            placeholder="ban@example.com"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setError('');
              setSuccess('');
            }}
            autoComplete="email"
          />
        </div>

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Đang gửi...' : 'Gửi đường dẫn đặt lại'}
        </button>
      </form>

      <Link to="/login" className="auth-link">
        Quay lại trang đăng nhập
      </Link>
    </div>
  );
}
