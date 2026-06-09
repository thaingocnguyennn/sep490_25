import React, { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { usersApi } from '../../../api';
import { useAuth } from '../../../contexts/AuthContext';
import type { User } from '../../../types';

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user: authUser, isAuthenticated } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) return;

    const loadProfile = async () => {
      try {
        const { data } = await usersApi.getMe();
        setUser(data.data!);
      } catch {
        // handled by interceptor
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [isAuthenticated]);

  const getStatusClass = (status: string) => {
    if (status === 'ACTIVE') return 'active';
    if (status === 'LOCKED') return 'locked';
    return 'inactive';
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (loading) {
    return (
      <>
        <div className="top-bar"><h1>My Profile</h1></div>
        <div className="page-content">
          <div className="loading-spinner"><div className="spinner" /></div>
        </div>
      </>
    );
  }

  if (!user) return null;

  return (
    <>
      <div className="top-bar">
        <h1>My Profile</h1>
        <button
          className="btn btn-primary"
          onClick={() => navigate('/profile/edit')}
        >
          Edit Profile
        </button>
      </div>

      <div className="page-content">
        <div className="card">
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: 20,
                  fontWeight: 700,
                }}
              >
                {user.fullName
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2)}
              </div>
              <div>
                <h2 style={{ margin: 0 }}>{user.fullName}</h2>
                <span className={`status-badge ${getStatusClass(user.status)}`} style={{ marginTop: 4 }}>
                  {user.status}
                </span>
              </div>
            </div>
          </div>
          <div className="card-body">
            <div className="user-detail-grid">
              <div className="detail-item">
                <label>Username</label>
                <span>{user.username}</span>
              </div>
              <div className="detail-item">
                <label>Email</label>
                <span>{user.email}</span>
              </div>
              <div className="detail-item">
                <label>Full Name</label>
                <span>{user.fullName}</span>
              </div>
              <div className="detail-item">
                <label>Phone</label>
                <span>{user.phone || '—'}</span>
              </div>
              <div className="detail-item">
                <label>Roles</label>
                <span>
                  {user.roles.map((role: string) => (
                    <span key={role} className="role-badge">
                      {role}
                    </span>
                  ))}
                </span>
              </div>
              <div className="detail-item">
                <label>First Login</label>
                <span>{user.isFirstLogin ? 'Yes' : 'No'}</span>
              </div>
              <div className="detail-item">
                <label>Last Login</label>
                <span>{formatDate(user.lastLogin)}</span>
              </div>
              <div className="detail-item">
                <label>Member Since</label>
                <span>{formatDate(user.createdAt)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
