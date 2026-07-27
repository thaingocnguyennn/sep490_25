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
      setError('This password reset link is invalid or incomplete');
      return;
    }

    if (!form.newPassword || !form.confirmPassword) {
      setError('Please fill in all fields');
      return;
    }

    if (form.newPassword !== form.confirmPassword) {
      setError('New password and confirm password do not match');
      return;
    }

    if (form.newPassword.length < 8 || !/[A-Z]/.test(form.newPassword) || !/[a-z]/.test(form.newPassword) || !/[0-9]/.test(form.newPassword)) {
      setError('Password must be at least 8 characters with uppercase, lowercase, and number');
      return;
    }

    setLoading(true);
    try {
      await authApi.resetPassword({ ...form, token });
      setSuccess('Password reset successfully. Redirecting to login...');
      setTimeout(() => navigate('/login', { replace: true }), 1200);
    } catch (err: unknown) {
      const errorResponse = err as { response?: { data?: { message?: string } } };
      setError(errorResponse.response?.data?.message || 'Unable to reset password');
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
      <h1 className="login-title">Set a new password</h1>
      <p className="subtitle">Choose a strong password for your DMS account.</p>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="newPassword">New password</label>
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
          <label htmlFor="confirmPassword">Confirm new password</label>
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

        <p className="password-hint">At least 8 characters with uppercase, lowercase, and number.</p>

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Saving...' : 'Reset password'}
        </button>
      </form>

      <Link to="/login" className="auth-link">
        Back to login
      </Link>
    </div>
  );
}
