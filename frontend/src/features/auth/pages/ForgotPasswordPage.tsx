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
      setError('Please enter your email address');
      return;
    }

    setLoading(true);
    try {
      const response = await authApi.forgotPassword({ email: email.trim() });
      setSuccess(response.data.message);
    } catch (err: unknown) {
      const errorResponse = err as { response?: { data?: { message?: string } } };
      setError(errorResponse.response?.data?.message || 'Unable to send reset email');
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
      <h1 className="login-title">Forgot password?</h1>
      <p className="subtitle">
        Enter your account email and we&apos;ll send you a link to reset your password.
      </p>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            name="email"
            type="email"
            placeholder="you@example.com"
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
          {loading ? 'Sending...' : 'Send reset link'}
        </button>
      </form>

      <Link to="/login" className="auth-link">
        Back to login
      </Link>
    </div>
  );
}
