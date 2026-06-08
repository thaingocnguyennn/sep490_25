import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usersApi } from '../../../api';
import type { User, Role } from '../../../types';

type UserStatus = 'ACTIVE' | 'INACTIVE' | 'LOCKED';

interface FormState {
  username: string;
  email: string;
  password: string;
  fullName: string;
  phone: string;
  status: UserStatus;
  roleIds: number[];
}

export default function UserFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [form, setForm] = useState<FormState>({
    username: '',
    email: '',
    password: '',
    fullName: '',
    phone: '',
    status: 'ACTIVE',
    roleIds: [],
  });
  const [roles, setRoles] = useState<Role[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingUser, setFetchingUser] = useState(isEdit);

  useEffect(() => {
    const loadRoles = async () => {
      try {
        const { data } = await usersApi.getRoles();
        setRoles(data.data!);
      } catch {
        // handled by interceptor
      }
    };
    loadRoles();
  }, []);

  useEffect(() => {
    if (!isEdit) return;

    const loadUser = async () => {
      setFetchingUser(true);
      try {
        const { data } = await usersApi.getById(Number(id));
        const user: User = data.data!;
        setForm({
          username: user.username,
          email: user.email,
          password: '',
          fullName: user.fullName,
          phone: user.phone || '',
          status: user.status as UserStatus,
          roleIds: [],
        });
      } catch {
        navigate('/users');
      } finally {
        setFetchingUser(false);
      }
    };

    loadUser();
  }, [id, isEdit, navigate]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setError('');
  };

  const handleRoleToggle = (roleId: number) => {
    setForm((prev) => ({
      ...prev,
      roleIds: prev.roleIds.includes(roleId)
        ? prev.roleIds.filter((r) => r !== roleId)
        : [...prev.roleIds, roleId],
    }));
  };

  const validate = () => {
    if (!form.username.trim()) return 'Username is required';
    if (form.username.length < 3) return 'Username must be at least 3 characters';
    if (!form.email.trim()) return 'Email is required';
    if (!form.fullName.trim()) return 'Full name is required';
    if (!isEdit && !form.password) return 'Password is required';
    if (!isEdit && form.password.length < 8) return 'Password must be at least 8 characters';
    if (form.roleIds.length === 0) return 'At least one role must be assigned';
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
      if (isEdit) {
        const updatePayload = {
          username: form.username,
          email: form.email,
          fullName: form.fullName,
          phone: form.phone || undefined,
          status: form.status,
          roleIds: form.roleIds,
        };
        await usersApi.update(Number(id), updatePayload);
      } else {
        const createPayload = {
          username: form.username,
          email: form.email,
          password: form.password,
          fullName: form.fullName,
          phone: form.phone || undefined,
          roleIds: form.roleIds,
        };
        await usersApi.create(createPayload);
      }

      navigate('/users');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setError(error.response?.data?.message || 'Operation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (fetchingUser) {
    return (
      <>
        <div className="top-bar"><h1>{isEdit ? 'Edit User' : 'Create User'}</h1></div>
        <div className="page-content">
          <div className="loading-spinner"><div className="spinner" /></div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="top-bar">
        <h1>{isEdit ? 'Edit User' : 'Create User'}</h1>
        <button className="btn btn-secondary" onClick={() => navigate('/users')}>
          Back
        </button>
      </div>

      <div className="page-content">
        <div className="card" style={{ maxWidth: 640 }}>
          <div className="card-body">
            {error && <div className="alert alert-error">{error}</div>}

            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="username">Username *</label>
                  <input
                    id="username"
                    name="username"
                    type="text"
                    value={form.username}
                    onChange={handleChange}
                    placeholder="e.g. john_doe"
                    disabled={isEdit}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="email">Email *</label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="e.g. john@example.com"
                  />
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

                <div className="form-group">
                  <label htmlFor="password">
                    Password {isEdit ? '(leave blank to keep current)' : '*'}
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    value={form.password}
                    onChange={handleChange}
                    placeholder={isEdit ? '••••••••' : 'Min. 8 characters'}
                    autoComplete={isEdit ? 'new-password' : 'current-password'}
                  />
                </div>

                {isEdit && (
                  <div className="form-group">
                    <label htmlFor="status">Status</label>
                    <select
                      id="status"
                      name="status"
                      value={form.status}
                      onChange={handleChange}
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                      <option value="LOCKED">Locked</option>
                    </select>
                  </div>
                )}

                <div className="form-group full-width">
                  <label>Roles *</label>
                  <div className="checkbox-group">
                    {roles.map((role) => (
                      <label key={role.id} className="checkbox-item">
                        <input
                          type="checkbox"
                          checked={form.roleIds.includes(role.id)}
                          onChange={() => handleRoleToggle(role.id)}
                        />
                        <span style={{ fontWeight: 500 }}>{role.name}</span>
                        {role.description && (
                          <span style={{ color: '#636e72', fontSize: 12 }}>
                            {' '}
                            — {role.description}
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => navigate('/users')}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                  style={{ flex: 1 }}
                >
                  {loading ? 'Saving...' : isEdit ? 'Update User' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
