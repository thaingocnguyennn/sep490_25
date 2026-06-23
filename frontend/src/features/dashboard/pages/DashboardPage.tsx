import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { documentsApi } from '../../../api';
import type { DashboardStats } from '../../../api/modules/documents';

// ─── Màu sắc theo Nghị định 30 ────────────────────────────────────────────────
const COLORS = {
  incoming: '#3b82f6',   // Xanh dương — Văn bản đến
  outgoing: '#10b981',   // Xanh lá   — Văn bản đi
  pending:  '#f59e0b',   // Vàng       — Đang xử lý
  issued:   '#8b5cf6',   // Tím        — Đã phát hành
  grid:     '#e5e7eb',
  text:     '#6b7280',
};

// Trạng thái văn bản đi theo nghị định 30
const OUTGOING_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Dự thảo',
  SUBMITTED: 'Đã trình',
  RETURNED: 'Trả lại',
  APPROVED: 'Đã duyệt',
  WAITING_FOR_ISSUE: 'Chờ phát hành',
  ISSUED: 'Đã phát hành',
  RECALLED: 'Thu hồi',
  COMPLETED: 'Hoàn thành',
  TRASHED: 'Thùng rác',
};

const INCOMING_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Chờ xử lý',
  IN_PROGRESS: 'Đang xử lý',
  COMPLETED: 'Đã hoàn thành',
  REJECTED: 'Từ chối',
  DRAFT: 'Dự thảo',
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#9ca3af',
  SUBMITTED: '#3b82f6',
  RETURNED: '#f59e0b',
  APPROVED: '#10b981',
  WAITING_FOR_ISSUE: '#8b5cf6',
  ISSUED: '#06b6d4',
  RECALLED: '#ef4444',
  COMPLETED: '#059669',
  TRASHED: '#6b7280',
  PENDING: '#f59e0b',
  IN_PROGRESS: '#3b82f6',
  REJECTED: '#ef4444',
};

// ─── Component biểu đồ đường/cột Trend ─────────────────────────────────────
function TrendChart({ trend }: { trend: DashboardStats['trend'] }) {
  const maxVal = Math.max(...trend.incoming, ...trend.outgoing, 1);
  const W = 100; // viewBox width %
  const H = 120; // viewBox height
  const PAD = { top: 10, bottom: 30, left: 8, right: 8 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const pointX = (i: number) => PAD.left + (i / 11) * innerW;
  const pointY = (v: number) => PAD.top + innerH - (v / maxVal) * innerH;

  const linePath = (data: number[]) =>
    data
      .map((v, i) => `${i === 0 ? 'M' : 'L'} ${pointX(i).toFixed(2)} ${pointY(v).toFixed(2)}`)
      .join(' ');

  const areaPath = (data: number[], color: string) => {
    const pts = data.map((v, i) => ({ x: pointX(i), y: pointY(v) }));
    const d = pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(' ');
    const closeBottom =
      ` L ${pointX(11).toFixed(2)} ${(PAD.top + innerH).toFixed(2)}` +
      ` L ${pointX(0).toFixed(2)} ${(PAD.top + innerH).toFixed(2)} Z`;
    return { d: d + closeBottom, color };
  };

  const inArea = areaPath(trend.incoming, COLORS.incoming);
  const outArea = areaPath(trend.outgoing, COLORS.outgoing);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 200, overflow: 'visible' }}>
      {/* Lưới ngang */}
      {[0, 0.25, 0.5, 0.75, 1].map((r) => {
        const y = PAD.top + innerH * (1 - r);
        return (
          <g key={r}>
            <line x1={PAD.left} y1={y} x2={PAD.left + innerW} y2={y} stroke={COLORS.grid} strokeWidth="0.3" />
            <text x={PAD.left - 1} y={y + 1} fontSize="3" fill={COLORS.text} textAnchor="end">
              {Math.round(maxVal * r)}
            </text>
          </g>
        );
      })}

      {/* Area đến */}
      <path d={inArea.d} fill={COLORS.incoming} fillOpacity="0.12" />
      {/* Area đi */}
      <path d={outArea.d} fill={COLORS.outgoing} fillOpacity="0.12" />

      {/* Line đến */}
      <path d={linePath(trend.incoming)} fill="none" stroke={COLORS.incoming} strokeWidth="0.8" strokeLinejoin="round" />
      {/* Line đi */}
      <path d={linePath(trend.outgoing)} fill="none" stroke={COLORS.outgoing} strokeWidth="0.8" strokeLinejoin="round" />

      {/* Chấm và nhãn tháng */}
      {trend.months.map((m, i) => (
        <g key={m}>
          <circle cx={pointX(i)} cy={pointY(trend.incoming[i])} r="1" fill={COLORS.incoming} />
          <circle cx={pointX(i)} cy={pointY(trend.outgoing[i])} r="1" fill={COLORS.outgoing} />
          <text x={pointX(i)} y={H - 5} fontSize="3" fill={COLORS.text} textAnchor="middle">{m}</text>
        </g>
      ))}
    </svg>
  );
}

// ─── Component biểu đồ cột ngang (Donut giả) ─────────────────────────────────
function HBarChart({ items }: { items: { label: string; count: number; color: string }[] }) {
  const total = items.reduce((s, it) => s + it.count, 0) || 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((it) => (
        <div key={it.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
            <span style={{ color: '#374151', fontWeight: 500 }}>{it.label}</span>
            <span style={{ color: it.color, fontWeight: 600 }}>{it.count}</span>
          </div>
          <div style={{ height: 8, background: '#f3f4f6', borderRadius: 4, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${(it.count / total) * 100}%`,
                background: it.color,
                borderRadius: 4,
                transition: 'width 0.6s ease',
              }}
            />
          </div>
        </div>
      ))}
      {items.length === 0 && (
        <p style={{ color: COLORS.text, fontSize: 13, textAlign: 'center', padding: '16px 0' }}>Chưa có dữ liệu</p>
      )}
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({
  icon, label, value, sub, color,
}: {
  icon: string; label: string; value: number; sub?: string; color: string;
}) {
  return (
    <div
      style={{
        background: '#fff',
        border: `1px solid ${COLORS.grid}`,
        borderRadius: 12,
        padding: '20px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: `${color}15`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 22,
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 26, fontWeight: 700, color: '#111827', lineHeight: 1 }}>{value.toLocaleString('vi-VN')}</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: color, marginTop: 2, fontWeight: 500 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());

  const loadStats = useCallback(async (y: number) => {
    setLoading(true);
    setError('');
    try {
      const res = await documentsApi.getDashboardStats({ year: y });
      if (res.data.data) setStats(res.data.data);
    } catch {
      setError('Không tải được dữ liệu thống kê. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStats(year); }, [year, loadStats]);

  const yearOptions = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  return (
    <>
      {/* ─── Top Bar ─────────────────────────────────────────────────────── */}
      <div className="top-bar">
        <h1>📊 Dashboard — Thống kê Văn bản</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>Năm:</label>
          <select
            id="dashboard-year-filter"
            className="filter-select"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            style={{ minWidth: 100 }}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="page-content">
        {user?.roles?.includes('SPECIALIST') && !user?.roles?.includes('ADMIN') && !user?.roles?.includes('DEPARTMENT_HEAD') && !user?.roles?.includes('DOCUMENT_CLERK') && (
          <div style={{
            background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8,
            padding: '12px 16px', marginBottom: 16, color: '#1e40af', fontSize: 14,
            display: 'flex', alignItems: 'center', gap: 8
          }}>
            ℹ️ Đang xem dữ liệu nội bộ phòng ban.
          </div>
        )}

        {/* Thông báo lỗi */}
        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
            padding: '12px 16px', marginBottom: 16, color: '#dc2626', fontSize: 14,
          }}>
            ⚠️ {error}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: COLORS.text }}>
            <div style={{ fontSize: 32 }}>⏳</div>
            <p style={{ marginTop: 12 }}>Đang tải dữ liệu thống kê...</p>
          </div>
        ) : stats ? (
          <>
            {/* ─── KPI Cards ───────────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
              <KpiCard icon="📋" label="Tổng số văn bản" value={stats.kpi.total} color="#3b82f6" />
              <KpiCard
                icon="📥" label="Văn bản đến"
                value={stats.kpi.totalIncoming}
                sub={`${stats.kpi.incomingPending} đang xử lý`}
                color={COLORS.incoming}
              />
              <KpiCard
                icon="📤" label="Văn bản đi"
                value={stats.kpi.totalOutgoing}
                sub={`${stats.kpi.outgoingIssued} đã phát hành`}
                color={COLORS.outgoing}
              />
              <KpiCard
                icon="⏳" label="Đang chờ xử lý"
                value={stats.kpi.incomingPending}
                sub="Văn bản đến"
                color={COLORS.pending}
              />
            </div>

            {/* ─── Biểu đồ Trend 12 tháng ─────────────────────────────── */}
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-header" style={{ justifyContent: 'space-between' }}>
                <h2>📈 Lượng văn bản theo tháng năm {year}</h2>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 12 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 20, height: 3, background: COLORS.incoming, display: 'inline-block', borderRadius: 2 }} />
                    Văn bản đến
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 20, height: 3, background: COLORS.outgoing, display: 'inline-block', borderRadius: 2 }} />
                    Văn bản đi
                  </span>
                </div>
              </div>
              <div className="card-body">
                <TrendChart trend={stats.trend} />
              </div>
            </div>

            {/* ─── Hàng 2: Trạng thái đến & đi ────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              {/* Trạng thái văn bản đến */}
              <div className="card">
                <div className="card-header">
                  <h2>📥 Trạng thái Văn bản đến</h2>
                </div>
                <div className="card-body">
                  <HBarChart
                    items={stats.incomingStatus.map((s) => ({
                      label: INCOMING_STATUS_LABELS[s.status] ?? s.status,
                      count: s.count,
                      color: STATUS_COLORS[s.status] ?? '#6b7280',
                    }))}
                  />
                </div>
              </div>

              {/* Trạng thái văn bản đi */}
              <div className="card">
                <div className="card-header">
                  <h2>📤 Trạng thái Văn bản đi</h2>
                </div>
                <div className="card-body">
                  <HBarChart
                    items={stats.outgoingStatus.map((s) => ({
                      label: OUTGOING_STATUS_LABELS[s.status] ?? s.status,
                      count: s.count,
                      color: STATUS_COLORS[s.status] ?? '#6b7280',
                    }))}
                  />
                </div>
              </div>
            </div>

            {/* ─── Phân bổ độ khẩn văn bản đến ────────────────────────── */}
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-header">
                <h2>🚨 Phân bổ độ khẩn — Văn bản đến</h2>
              </div>
              <div className="card-body">
                <HBarChart
                  items={stats.urgencyDistribution.map((u, i) => ({
                    label: u.name,
                    count: u.count,
                    color: [COLORS.issued, COLORS.incoming, COLORS.pending, COLORS.outgoing, '#ef4444'][i % 5],
                  }))}
                />
              </div>
            </div>

            {/* ─── Lối tắt nhanh ────────────────────────────────────────── */}
            <div className="card">
              <div className="card-header"><h2>🔗 Truy cập nhanh</h2></div>
              <div className="card-body">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {[
                    { label: '📥 Văn bản đến', path: '/incoming-documents' },
                    { label: '📤 Văn bản đi', path: '/outgoing-documents' },
                    { label: '📊 Thống kê văn bản đi', path: '/outgoing-documents/statistics' },
                    { label: '📄 Tất cả văn bản', path: '/documents' },
                  ].map((link) => (
                    <button
                      key={link.path}
                      id={`quick-link-${link.path.replace(/\//g, '-').replace(/^-/, '')}`}
                      className="btn btn-secondary"
                      onClick={() => navigate(link.path)}
                    >
                      {link.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : (
          /* Fallback nếu stats null nhưng không loading */
          <div style={{ textAlign: 'center', padding: 60, color: COLORS.text }}>
            <div style={{ fontSize: 32 }}>📭</div>
            <p style={{ marginTop: 12 }}>Không có dữ liệu</p>
          </div>
        )}
      </div>
    </>
  );
}
