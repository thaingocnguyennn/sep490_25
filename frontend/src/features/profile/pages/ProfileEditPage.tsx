import { useState, useEffect } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { authApi } from '../../../api';
import { useAuth } from '../../../contexts/AuthContext';
import type { User } from '../../../types';

interface FormState {
  fullName: string;
  phone: string;
}

export default function ProfileEditPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { updateUser, isAuthenticated } = useAuth();
  const profilePath = location.pathname.startsWith('/admin/') ? '/admin/profile' : '/profile';
  const [profile, setProfile] = useState<User | null>(null);
  const [form, setForm] = useState<FormState>({ fullName: '', phone: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingProfile, setFetchingProfile] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) return;

    const loadProfile = async () => {
      try {
        const { data } = await authApi.getProfile();
        const user: User = data.data!;
        setProfile(user);
        setForm({ fullName: user.fullName, phone: user.phone || '' });
      } catch (err: unknown) {
        const apiError = err as { response?: { data?: { message?: string } } };
        setError(apiError.response?.data?.message || 'Không thể tải hồ sơ. Vui lòng thử lại.');
      } finally {
        setFetchingProfile(false);
      }
    };

    loadProfile();
  }, [isAuthenticated]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setError('');
  };

  const validate = () => {
    const fullName = form.fullName.trim();
    const phone = form.phone.trim();
    if (!fullName) return 'Vui lòng nhập họ và tên';
    if (fullName.length < 2 || fullName.length > 100) {
      return 'Họ và tên phải có từ 2 đến 100 ký tự';
    }
    if (phone && !/^[0-9]{10,15}$/.test(phone)) {
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
      const { data } = await authApi.updateProfile({
        fullName: form.fullName.trim(),
        phone: form.phone.trim() || null,
      });
      const updatedUser = data.data!;
      updateUser(updatedUser);
      navigate(profilePath);
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

  if (!profile) {
    return (
      <>
        <div className="top-bar">
          <h1>Chỉnh sửa hồ sơ</h1>
          <button className="btn btn-secondary" onClick={() => navigate(profilePath)}>
            Quay lại
          </button>
        </div>
        <div className="page-content">
          <div className="alert alert-error">
            {error || 'Không tìm thấy thông tin hồ sơ.'}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="top-bar">
        <h1>Chỉnh sửa hồ sơ</h1>
        <button className="btn btn-secondary" onClick={() => navigate(profilePath)}>
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
                    value={profile?.username || ''}
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
                    value={profile?.email || ''}
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
                  onClick={() => navigate(profilePath)}
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
