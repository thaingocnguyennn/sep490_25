import React, { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { usersApi } from '../../../api';
import { useAuth } from '../../../contexts/AuthContext';
import type { User } from '../../../types';

interface FormState {
  fullName: string;
  phone: string;
}

export default function ProfileEditPage() {
  const navigate = useNavigate();
  const { user: authUser, updateUser, isAuthenticated } = useAuth();
  const [form, setForm] = useState<FormState>({ fullName: '', phone: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingProfile, setFetchingProfile] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) return;

    const loadProfile = async () => {
      try {
        const { data } = await usersApi.getMe();
        const user: User = data.data!;
        setForm({ fullName: user.fullName, phone: user.phone || '' });
      } catch {
        navigate('/profile');
      } finally {
        setFetchingProfile(false);
      }
    };

    loadProfile();
  }, [isAuthenticated, navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setError('');
  };

  const validate = () => {
    if (!form.fullName.trim()) return 'Full name is required';
    if (form.fullName.length < 2) return 'Full name must be at least 2 characters';
    if (form.phone && !/^[0-9]{10,15}$/.test(form.phone)) {
      return 'Phone must be 10-15 digits';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data } = await usersApi.updateMe({
        fullName: form.fullName,
        phone: form.phone || undefined,
      });

      const updatedUser: User = {
        ...(authUser as User),
        fullName: data.data!.fullName,
        phone: data.data!.phone,
      };
      updateUser(updatedUser);

      navigate('/profile');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setError(error.response?.data?.message || 'Failed to update profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (fetchingProfile) {
    return (
      <>
        <div className="top-bar"><h1>Edit Profile</h1></div>
        <div className="page-content">
          <div className="loading-spinner"><div className="spinner" /></div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="top-bar">
        <h1>Edit Profile</h1>
        <button className="btn btn-secondary" onClick={() => navigate('/profile')}>
          Back
        </button>
      </div>

      <div className="page-content">
        <div className="card" style={{ maxWidth: 520 }}>
          <div className="card-body">
            {error && <div className="alert alert-error">{error}</div>}

            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                <div className="form-group full-width">
                  <label htmlFor="username">Username</label>
                  <input
                    id="username"
                    type="text"
                    value={(authUser as User)?.username || ''}
                    disabled
                    style={{ backgroundColor: '#f5f6fa', cursor: 'not-allowed' }}
                  />
                  <small style={{ color: '#636e72', fontSize: 12 }}>
                    Username cannot be changed.
                  </small>
                </div>

                <div className="form-group full-width">
                  <label htmlFor="email">Email</label>
                  <input
                    id="email"
                    type="email"
                    value={(authUser as User)?.email || ''}
                    disabled
                    style={{ backgroundColor: '#f5f6fa', cursor: 'not-allowed' }}
                  />
                  <small style={{ color: '#636e72', fontSize: 12 }}>
                    Contact an admin to change your email.
                  </small>
                </div>

                <div className="form-group">
                  <label htmlFor="fullName">Full Name *</label>
                  <input
                    id="fullName"
                    name="fullName"
                    type="text"
                    value={form.fullName}
                    onChange={handleChange}
                    placeholder="e.g. John Doe"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="phone">Phone</label>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    value={form.phone}
                    onChange={handleChange}
                    placeholder="e.g. 0901234567"
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => navigate('/profile')}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                  style={{ flex: 1 }}
                >
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
