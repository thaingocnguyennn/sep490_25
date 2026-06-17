import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDepartments, useDepartmentActions } from '../../../shared/hooks';
import { useAuth } from '../../../contexts/AuthContext';
import { LoadingSpinner } from '../../../shared/components';
import type { Department } from '../../../api';

interface FormState {
  name: string;
  description: string;
  parentId: string; // empty string means "no parent"
}

export default function DepartmentFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const isEdit = Boolean(id);

  const { departments, loading: listLoading, fetchById } = useDepartments({ autoFetch: true });
  const { createDepartment, updateDepartment, actionLoading, actionError, clearActionError } =
    useDepartmentActions();

  const [form, setForm] = useState<FormState>({ name: '', description: '', parentId: '' });
  const [error, setError] = useState('');
  const [fetching, setFetching] = useState(isEdit);

  // Compute the set of descendant ids of the current department (for the parent dropdown).
  const excludedParentIds = useMemo(() => {
    if (!isEdit || !id) return new Set<number>();
    const currentId = Number(id);
    const excluded = new Set<number>([currentId]);
    let frontier: number[] = [currentId];
    while (frontier.length > 0) {
      const next: number[] = [];
      for (const d of departments) {
        if (d.parentId !== null && frontier.includes(d.parentId) && !excluded.has(d.id)) {
          excluded.add(d.id);
          next.push(d.id);
        }
      }
      frontier = next;
    }
    return excluded;
  }, [departments, id, isEdit]);

  useEffect(() => {
    if (!isAdmin || !isEdit) return;

    const loadDepartment = async () => {
      setFetching(true);
      try {
        const d = await fetchById(Number(id));
        setForm({
          name: d.name,
          description: d.description || '',
          parentId: d.parentId ? String(d.parentId) : '',
        });
      } catch {
        navigate('/admin/departments');
      } finally {
        setFetching(false);
      }
    };
    loadDepartment();
  }, [id, isAdmin, isEdit, navigate, fetchById]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setError('');
    clearActionError();
  };

  const validate = (): string | null => {
    const name = form.name.trim();
    if (!name) return 'Department name is required';
    if (name.length > 100) return 'Department name must be at most 100 characters';
    if (form.description.length > 500) return 'Description must be at most 500 characters';
    if (form.parentId && !/^\d+$/.test(form.parentId)) {
      return 'Invalid parent department';
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

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      parentId: form.parentId ? Number(form.parentId) : null,
    };

    try {
      if (isEdit) {
        await updateDepartment(Number(id), payload);
      } else {
        await createDepartment(payload);
      }
      navigate('/admin/departments');
    } catch {
      // actionError already populated by the hook
    }
  };

  if (!isAdmin) {
    return <div className="page-content"><p>Access denied.</p></div>;
  }

  if (fetching || listLoading) {
    return (
      <>
        <div className="top-bar">
          <h1>{isEdit ? 'Edit Department' : 'Create Department'}</h1>
        </div>
        <div className="page-content">
          <LoadingSpinner />
        </div>
      </>
    );
  }

  // Sort parent options alphabetically and exclude self + descendants
  const parentOptions: Department[] = departments
    .filter((d) => !excludedParentIds.has(d.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <div className="top-bar">
        <h1>{isEdit ? 'Edit Department' : 'Create Department'}</h1>
        <button className="btn btn-secondary" onClick={() => navigate('/admin/departments')}>
          Back
        </button>
      </div>

      <div className="page-content">
        <div className="card" style={{ maxWidth: 560 }}>
          <div className="card-body">
            {error && <div className="alert alert-error">{error}</div>}
            {actionError && !error && <div className="alert alert-error">{actionError}</div>}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="name">Department Name *</label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="e.g. Human Resources"
                  disabled={actionLoading}
                  autoComplete="off"
                  maxLength={100}
                />
                <small style={{ color: '#636e72', fontSize: 12 }}>
                  1-100 characters. Must be unique within the same parent.
                </small>
              </div>

              <div className="form-group" style={{ marginTop: 16 }}>
                <label htmlFor="description">Description</label>
                <textarea
                  id="description"
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  placeholder="Optional description for this department"
                  rows={3}
                  maxLength={500}
                  disabled={actionLoading}
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
                  {form.description.length}/500 characters
                </small>
              </div>

              <div className="form-group" style={{ marginTop: 16 }}>
                <label htmlFor="parentId">Parent Department</label>
                <select
                  id="parentId"
                  name="parentId"
                  value={form.parentId}
                  onChange={handleChange}
                  disabled={actionLoading}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #dfe6e9',
                    borderRadius: 6,
                    fontSize: 14,
                    background: 'white',
                  }}
                >
                  <option value="">-- None (root department) --</option>
                  {parentOptions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <small style={{ color: '#636e72', fontSize: 12 }}>
                  Optional. Leave empty to create a root department. The current department
                  and its sub-departments are excluded to prevent circular references.
                </small>
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => navigate('/admin/departments')}
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={actionLoading}
                  style={{ flex: 1 }}
                >
                  {actionLoading
                    ? 'Saving...'
                    : isEdit
                    ? 'Update Department'
                    : 'Create Department'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
