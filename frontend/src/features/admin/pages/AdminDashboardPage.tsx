import { useEffect, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { documentsApi } from '../../../api';

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ total: 0, incoming: 0, outgoing: 0 });

  useEffect(() => {
    documentsApi.getStats()
      .then(res => {
        if (res.data.data) setStats(res.data.data);
      })
      .catch(err => console.error('Tải thống kê thất bại', err));
  }, []);

  return (
    <>
      <div className="top-bar">
        <h1>Bảng điều khiển Quản trị</h1>
      </div>
      <div className="page-content">
        <div className="card">
          <div className="card-body">
            <h2 style={{ marginBottom: 16 }}>Chào mừng, {user?.fullName}!</h2>
            <p style={{ color: '#636e72' }}>
              Bạn đang đăng nhập với vai trò <strong>{user?.roles?.[0] || 'Người dùng'}</strong>.
              Đây là bảng điều khiển dành cho quản trị viên.
            </p>
            <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {[
                { label: 'Tài liệu', count: stats.total, icon: '📄' },
                { label: 'Văn bản đến', count: stats.incoming, icon: '📥' },
                { label: 'Văn bản đi', count: stats.outgoing, icon: '📤' },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    padding: 24,
                    background: '#f8f9fa',
                    borderRadius: 8,
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 32 }}>{item.icon}</div>
                  <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>{item.count}</div>
                  <div style={{ fontSize: 14, color: '#636e72', marginTop: 4 }}>{item.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
