import { useAuth } from '../../../contexts/AuthContext';

export default function AdminDashboardPage() {
  const { user } = useAuth();

  return (
    <>
      <div className="top-bar">
        <h1>Admin Dashboard</h1>
      </div>
      <div className="page-content">
        <div className="card">
          <div className="card-body">
            <h2 style={{ marginBottom: 16 }}>Welcome, {user?.fullName}!</h2>
            <p style={{ color: '#636e72' }}>
              You are logged in as <strong>{user?.roles?.[0] || 'User'}</strong>.
              This is the admin management console.
            </p>
            <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {[
                { label: 'Documents', count: '—', icon: '📄' },
                { label: 'Incoming', count: '—', icon: '📥' },
                { label: 'Outgoing', count: '—', icon: '📤' },
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
