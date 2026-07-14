import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { rolesApi } from '../../../api';
import { useAuth } from '../../../contexts/AuthContext';
import { LoadingSpinner } from '../../../shared/components';

interface FormState {
  name: string;
  description: string;
}

export default function RoleFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const isEdit = Boolean(id);

  const [form, setForm] = useState<FormState>({ name: '', description: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingRole, setFetchingRole] = useState(isEdit);

  useEffect(() => {
    if (!isAdmin || !isEdit) return;

    const loadRole = async () => {
      setFetchingRole(true);
      try {
        const { data } = await rolesApi.getById(Number(id));
        setForm({ name: data.data!.name, description: data.data!.description || '' });
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
    if (!form.name.trim()) return 'Tên vai trò là bắt buộc';
    if (form.name.length < 2) return 'Tên vai trò phải có ít nhất 2 ký tự';
    if (!/^[A-Z][A-Z0-9_]*$/.test(form.name))
      return 'Tên vai trò chỉ được chứa chữ in hoa, số và dấu gạch dưới, bắt đầu bằng chữ cái';
    if (form.description.length > 255) return 'Mô tả phải có tối đa 255 ký tự';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setLoading(true);
    setError('');

    try {
      if (isEdit) {
        await rolesApi.update(Number(id), { name: form.name, description: form.description || undefined });
      } else {
        await rolesApi.create({ name: form.name, description: form.description || undefined });
      }
      navigate('/admin/roles');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setError(error.response?.data?.message || 'Thao tác thất bại. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  if (!isAdmin) {
    return <div className="page-content"><p>Truy cập bị từ chối.</p></div>;
  }

  if (fetchingRole) {
    return (
      <>
        <div className="top-bar"><h1>{isEdit ? 'Chỉnh sửa vai trò' : 'Tạo vai trò'}</h1></div>
        <div className="page-content"><LoadingSpinner /></div>
      </>
    );
  }

  return (
    <>
      <div className="top-bar">
        <h1>{isEdit ? 'Chỉnh sửa vai trò' : 'Tạo vai trò'}</h1>
        <button className="btn btn-secondary" onClick={() => navigate('/admin/roles')}>Quay lại</button>
      </div>

      <div className="page-content">
        <div className="card" style={{ maxWidth: 520 }}>
          <div className="card-body">
            {error && <div className="alert alert-error">{error}</div>}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="name">Tên vai trò *</label>
                <input
                  id="name" name="name" type="text" value={form.name}
                  onChange={handleChange} placeholder="VD: DEPARTMENT_HEAD"
                  disabled={isEdit} autoComplete="off"
                />
                <small style={{ color: '#636e72', fontSize: 12 }}>
                  Chỉ chứa chữ in hoa, số và dấu gạch dưới (VD: ADMIN, DEPARTMENT_HEAD, SPECIALIST)
                </small>
              </div>

              <div className="form-group" style={{ marginTop: 16 }}>
                <label htmlFor="description">Mô tả</label>
                <textarea
                  id="description" name="description" value={form.description}
                  onChange={handleChange} placeholder="Mô tả tùy chọn cho vai trò này"
                  rows={3} maxLength={255}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #dfe6e9', borderRadius: 6, fontSize: 14, resize: 'vertical', fontFamily: 'inherit' }}
                />
                <small style={{ color: '#636e72', fontSize: 12 }}>
                  {form.description.length}/255 ký tự
                </small>
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                <button type="button" className="btn btn-secondary"
                  onClick={() => navigate('/admin/roles')}>Hủy</button>
                <button type="submit" className="btn btn-primary" disabled={loading} style={{ flex: 1 }}>
                  {loading ? 'Đang lưu...' : isEdit ? 'Cập nhật vai trò' : 'Tạo vai trò'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
