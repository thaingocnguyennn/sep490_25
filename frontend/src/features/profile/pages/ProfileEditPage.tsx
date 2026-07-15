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
    if (!form.fullName.trim()) return 'Vui lòng nhập họ và tên';
    if (form.fullName.length < 2) return 'Họ và tên phải có ít nhất 2 ký tự';
    if (form.phone && !/^[0-9]{10,15}$/.test(form.phone)) {
      return 'Số điện thoại phải có từ 10 đến 15 chữ số';
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
      setError(error.response?.data?.message || 'Cập nhật hồ sơ thất bại. Vui lòng thử lại.');
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
        <div className="top-bar"><h1>Chỉnh sửa hồ sơ</h1></div>
        <div className="page-content">
          <div className="loading-spinner"><div className="spinner" /></div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="top-bar">
        <h1>Chỉnh sửa hồ sơ</h1>
        <button className="btn btn-secondary" onClick={() => navigate('/profile')}>
          Quay lại
        </button>
      </div>

      <div className="page-content">
        <div className="card" style={{ maxWidth: 520 }}>
          <div className="card-body">
            {error && <div className="alert alert-error">{error}</div>}

            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                <div className="form-group full-width">
                  <label htmlFor="username">Tên đăng nhập</label>
                  <input
                    id="username"
                    type="text"
                    value={(authUser as User)?.username || ''}
                    disabled
                    style={{ backgroundColor: '#f5f6fa', cursor: 'not-allowed' }}
                  />
                  <small style={{ color: '#636e72', fontSize: 12 }}>
                    Tên đăng nhập không thể thay đổi.
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
                    Liên hệ quản trị viên để thay đổi email.
                  </small>
                </div>

                <div className="form-group">
                  <label htmlFor="fullName">Họ và tên *</label>
                  <input
                    id="fullName"
                    name="fullName"
                    type="text"
                    value={form.fullName}
                    onChange={handleChange}
                    placeholder="Ví dụ: Nguyễn Văn A"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="phone">Số điện thoại</label>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    value={form.phone}
                    onChange={handleChange}
                    placeholder="Ví dụ: 0901234567"
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => navigate('/profile')}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                  style={{ flex: 1 }}
                >
                  {loading ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
