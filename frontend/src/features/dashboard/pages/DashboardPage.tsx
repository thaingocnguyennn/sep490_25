import { useEffect, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { documentsApi } from '../../../api';

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ total: 0, incoming: 0, outgoing: 0 });

  useEffect(() => {
    documentsApi.getStats()
      .then(res => {
        if (res.data.data) setStats(res.data.data);
      })
      .catch(err => console.error('Failed to load stats', err));
  }, []);

  return (
    <>
      <div className="top-bar">
        <h1>Dashboard</h1>
      </div>
      <div className="page-content">
        <div className="card">
          <div className="card-body">
            <h2 style={{ marginBottom: 16 }}>Welcome, {user?.fullName}!</h2>
            <p style={{ color: '#636e72' }}>
              You are logged in as <strong>{user?.roles?.[0] || 'User'}</strong>.
              This is the main dashboard of the Document Management System.
            </p>
            <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {[
                { label: 'Documents', count: stats.total, icon: '📄' },
                { label: 'Incoming', count: stats.incoming, icon: '📥' },
                { label: 'Outgoing', count: stats.outgoing, icon: '📤' },
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
