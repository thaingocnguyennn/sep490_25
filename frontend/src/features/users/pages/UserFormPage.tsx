import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { usersApi } from '../../../api';
import { useAuth } from '../../../contexts/AuthContext';
import { ROLES } from '../../../shared/constants/roles';
import { validatePasswordPolicy, PASSWORD_POLICY_HINT } from '../../../shared/utils/passwordPolicy';
import type { User, UserStatus, CreateUserRequest, UpdateUserRequest } from '../../../types';

interface RoleOption {
  id: number;
  name: string;
  description: string | null;
}

const STATIC_ROLES: RoleOption[] = [
  { id: 1, name: ROLES.ADMIN, description: 'Quản trị viên hệ thống với toàn quyền truy cập' },
  { id: 2, name: ROLES.DEPARTMENT_HEAD, description: 'Trưởng phòng ban với các quyền quản lý' },
  { id: 3, name: ROLES.SPECIALIST, description: 'Chuyên viên với quyền xử lý văn bản' },
  { id: 4, name: ROLES.DOCUMENT_CLERK, description: 'Văn thư với quyền truy cập cơ bản về văn bản' },
];

type FormState = {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  fullName: string;
  phone: string;
  status: UserStatus;
  roleIds: number[];
};

export default function UserFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const isEdit = Boolean(id);

  const [form, setForm] = useState<FormState>({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    phone: '',
    status: 'ACTIVE',
    roleIds: [],
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingUser, setFetchingUser] = useState(isEdit);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Pre-load roles from DB to get their IDs; fall back to static roles
  const [availableRoles, setAvailableRoles] = useState<RoleOption[]>(STATIC_ROLES);
  const [rolesLoaded, setRolesLoaded] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    usersApi.getRoles()
      .then(({ data }) => {
        if (data.data && data.data.length > 0) {
          setAvailableRoles(data.data.map((r) => ({ id: r.id, name: r.name, description: r.description })));
        }
        setRolesLoaded(true);
      })
      .catch(() => setRolesLoaded(true));
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin || !isEdit || !rolesLoaded) return;

    const loadUser = async () => {
      setFetchingUser(true);
      try {
        const { data } = await usersApi.getById(Number(id));
        const user: User = data.data!;
        const roleIds = availableRoles
          .filter((r) => user.roles.includes(r.name))
          .map((r) => r.id);
        setForm((prev) => ({ ...prev, username: user.username, email: user.email, password: '', confirmPassword: '', fullName: user.fullName, phone: user.phone || '', status: user.status, roleIds }));
      } catch {
        navigate('/admin/users');
      } finally {
        setFetchingUser(false);
      }
    };

    loadUser();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isAdmin, isEdit, navigate, rolesLoaded, availableRoles]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
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
    if (!form.username.trim()) return 'Tên đăng nhập là bắt buộc';
    if (form.username.length < 3) return 'Tên đăng nhập phải có ít nhất 3 ký tự';
    if (!form.email.trim()) return 'Email là bắt buộc';
    if (!form.fullName.trim()) return 'Họ và tên là bắt buộc';
    if (!isEdit && !form.password) return 'Mật khẩu là bắt buộc';
    if (!isEdit) {
      const passwordError = validatePasswordPolicy(form.password);
      if (passwordError) return passwordError;
    }
    if (!isEdit && form.password !== form.confirmPassword) return 'Mật khẩu xác nhận không khớp';
    if (form.roleIds.length === 0) return 'Phải chỉ định ít nhất một vai trò';
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
        const updatePayload: UpdateUserRequest = {
          username: form.username,
          email: form.email,
          fullName: form.fullName,
          phone: form.phone || undefined,
          status: form.status,
          roleIds: form.roleIds,
        };
        await usersApi.update(Number(id), updatePayload);
      } else {
        const createPayload: CreateUserRequest = {
          username: form.username,
          email: form.email,
          password: form.password,
          fullName: form.fullName,
          phone: form.phone || undefined,
          roleIds: form.roleIds,
        };
        await usersApi.create(createPayload);
      }
      navigate('/admin/users');
    } catch (err: unknown) {
      const error = err as {
        response?: {
          data?: {
            message?: string;
            errors?: Array<{ field?: string; message?: string }>;
          };
        };
      };
      const apiErrors = error.response?.data?.errors;
      const fieldMessage =
        apiErrors && apiErrors.length > 0
          ? apiErrors
              .map((e) => e.message)
              .filter(Boolean)
              .join('. ')
          : '';
      setError(
        fieldMessage ||
          error.response?.data?.message ||
          'Thao tác thất bại. Vui lòng thử lại.'
      );
    } finally {
      setLoading(false);
    }
  };

  if (!isAdmin) {
    return <div className="page-content"><p>Truy cập bị từ chối.</p></div>;
  }

  if (fetchingUser) {
    return (
      <>
        <div className="top-bar"><h1>{isEdit ? 'Chỉnh sửa người dùng' : 'Tạo người dùng'}</h1></div>
        <div className="page-content"><div className="loading-spinner"><div className="spinner" /></div></div>
      </>
    );
  }

  return (
    <>
      <div className="top-bar">
        <h1>{isEdit ? 'Chỉnh sửa người dùng' : 'Tạo người dùng'}</h1>
        <button className="btn btn-secondary" onClick={() => navigate('/admin/users')}>Quay lại</button>
      </div>

      <div className="page-content">
        <div className="card" style={{ maxWidth: 640 }}>
          <div className="card-body">
            {error && <div className="alert alert-error">{error}</div>}

            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="username">Tên đăng nhập *</label>
                  <input id="username" name="username" type="text" value={form.username}
                    onChange={handleChange} placeholder="VD: nguyen_van_a" disabled={isEdit} />
                </div>

                <div className="form-group">
                  <label htmlFor="email">Email *</label>
                  <input id="email" name="email" type="email" value={form.email}
                    onChange={handleChange} placeholder="VD: nguyenvana@example.com" />
                </div>

                <div className="form-group">
                  <label htmlFor="fullName">Họ và tên *</label>
                  <input id="fullName" name="fullName" type="text" value={form.fullName}
                    onChange={handleChange} placeholder="VD: Nguyễn Văn A" />
                </div>

                <div className="form-group">
                  <label htmlFor="phone">Số điện thoại</label>
                  <input id="phone" name="phone" type="tel" value={form.phone}
                    onChange={handleChange} placeholder="VD: 0901234567" />
                </div>

                {!isEdit && (
                  <div className="form-group">
                    <label htmlFor="password">Mật khẩu *</label>
                    <div className="password-input-wrapper">
                      <input
                        id="password"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        value={form.password}
                        onChange={handleChange}
                        placeholder="Nhập mật khẩu"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="password-toggle"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                      >
                        {showPassword ? <Eye /> : <EyeOff />}
                      </button>
                    </div>
                    <small style={{ fontSize: 12, color: '#636e72' }}>
                      {PASSWORD_POLICY_HINT}
                    </small>
                  </div>
                )}

                {!isEdit && (
                  <div className="form-group">
                    <label htmlFor="confirmPassword">Xác nhận mật khẩu *</label>
                    <div className="password-input-wrapper">
                      <input
                        id="confirmPassword"
                        name="confirmPassword"
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={form.confirmPassword}
                        onChange={handleChange}
                        placeholder="Nhập lại mật khẩu"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="password-toggle"
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                        aria-label={showConfirmPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                      >
                        {showConfirmPassword ? <Eye /> : <EyeOff />}
                      </button>
                    </div>
                  </div>
                )}

                {isEdit && (
                  <div className="form-group">
                    <label htmlFor="password">Mật khẩu (để trống nếu giữ nguyên)</label>
                    <div className="password-input-wrapper">
                      <input
                        id="password"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        value={form.password}
                        onChange={handleChange}
                        placeholder="••••••••"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="password-toggle"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                      >
                        {showPassword ? <Eye /> : <EyeOff />}
                      </button>
                    </div>
                  </div>
                )}

                {isEdit && (
                  <div className="form-group">
                    <label htmlFor="status">Trạng thái</label>
                    <select id="status" name="status" value={form.status} onChange={handleChange}>
                      <option value="ACTIVE">Hoạt động</option>
                      <option value="INACTIVE">Không hoạt động</option>
                      <option value="LOCKED">Bị khóa</option>
                    </select>
                  </div>
                )}

                <div className="form-group full-width">
                  <label>Vai trò *</label>
                  <div className="checkbox-group">
                    {availableRoles.map((role) => (
                      <label key={role.id} className="checkbox-item">
                        <input
                          type="checkbox"
                          checked={form.roleIds.includes(role.id)}
                          onChange={() => handleRoleToggle(role.id)}
                        />
                        <span style={{ fontWeight: 500 }}>{role.name}</span>
                        {role.description && (
                          <span style={{ color: '#636e72', fontSize: 12 }}>
                            {' '}&mdash; {role.description}
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                <button type="button" className="btn btn-secondary"
                  onClick={() => navigate('/admin/users')}>Hủy</button>
                <button type="submit" className="btn btn-primary" disabled={loading} style={{ flex: 1 }}>
                  {loading ? 'Đang lưu...' : isEdit ? 'Cập nhật người dùng' : 'Tạo người dùng'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
