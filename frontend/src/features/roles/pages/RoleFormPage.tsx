import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { rolesApi } from '../../../api';
import { useAuth } from '../../../contexts/AuthContext';

interface FormState {
  name: string;
  description: string;
}

export default function RoleFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const isEdit = Boolean(id);

  const [form, setForm] = useState<FormState>({
    name: '',
    description: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingRole, setFetchingRole] = useState(isEdit);

  useEffect(() => {
    if (!isAdmin) return;
    if (!isEdit) return;

    const loadRole = async () => {
      setFetchingRole(true);
      try {
        const { data } = await rolesApi.getById(Number(id));
        const role = data.data!;
        setForm({
          name: role.name,
          description: role.description || '',
        });
      } catch {
        navigate('/admin/roles');
      } finally {
        setFetchingRole(false);
      }
    };

    loadRole();
  }, [id, isAdmin, isEdit, navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value.toUpperCase() }));
    setError('');
  };

  const validate = () => {
    if (!form.name.trim()) return 'Role name is required';
    if (form.name.length < 2) return 'Role name must be at least 2 characters';
    if (!/^[A-Z_]+$/.test(form.name)) return 'Role name must contain only uppercase letters and underscores';
    if (form.description.length > 255) return 'Description must be at most 255 characters';
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
        await rolesApi.update(Number(id), {
          name: form.name,
          description: form.description || undefined,
        });
      } else {
        await rolesApi.create({
          name: form.name,
          description: form.description || undefined,
        });
      }

      navigate('/admin/roles');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setError(error.response?.data?.message || 'Operation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  if (fetchingRole) {
    return (
      <>
        <div className="top-bar">
          <h1>{isEdit ? 'Edit Role' : 'Create Role'}</h1>
        </div>
        <div className="page-content">
          <div className="loading-spinner">
            <div className="spinner" />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="top-bar">
        <h1>{isEdit ? 'Edit Role' : 'Create Role'}</h1>
        <button className="btn btn-secondary" onClick={() => navigate('/admin/roles')}>
          Back
        </button>
      </div>

      <div className="page-content">
        <div className="card" style={{ maxWidth: 520 }}>
          <div className="card-body">
            {error && <div className="alert alert-error">{error}</div>}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="name">Role Name *</label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="e.g. ROLE_ADMIN"
                  disabled={isEdit}
                  autoComplete="off"
                />
                <small style={{ color: '#636e72', fontSize: 12 }}>
                  Uppercase letters and underscores only (e.g. ROLE_ADMIN, MANAGER)
                </small>
              </div>

              <div className="form-group" style={{ marginTop: 16 }}>
                <label htmlFor="description">Description</label>
                <textarea
                  id="description"
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  placeholder="Optional description for this role"
                  rows={3}
                  maxLength={255}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #dfe6e9',
                    borderRadius: 6,
                    fontSize: 14,
                    resize: 'vertical',
                    fontFamily: 'inherit',
                  }}
                />
                <small style={{ color: '#636e72', fontSize: 12 }}>
                  {form.description.length}/255 characters
                </small>
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => navigate('/admin/roles')}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                  style={{ flex: 1 }}
                >
                  {loading ? 'Saving...' : isEdit ? 'Update Role' : 'Create Role'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
