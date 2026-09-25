import React, { useState } from 'react';
import { incomingDocumentsApi } from '../../../api/modules/documents';
import { useAuth } from '../../../contexts/AuthContext';
import { LoadingSpinner } from '../../../shared/components';

// ─── Nhãn trạng thái tiếng Việt ──────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Bản nháp',
  SUBMITTED: 'Chờ duyệt',
  RETURNED: 'Trả lại',
  APPROVED: 'Đã duyệt',
  IN_PROGRESS: 'Đang xử lý',
  COMPLETED: 'Hoàn tất',
  REJECTED: 'Từ chối',
  CANCELLED: 'Đã hủy',
  PENDING: 'Chờ xử lý',
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#95a5a6',
  SUBMITTED: '#3498db',
  RETURNED: '#e67e22',
  APPROVED: '#27ae60',
  IN_PROGRESS: '#9b59b6',
  COMPLETED: '#1abc9c',
  REJECTED: '#c0392b',
  CANCELLED: '#7f8c8d',
  PENDING: '#f39c12',
};

const PALETTE = [
  '#0984e3', '#00b894', '#6c5ce7', '#fdcb6e', '#e17055',
  '#fd79a8', '#55efc4', '#74b9ff', '#a29bfe', '#fab1a0',
];

function formatMonth(yyyyMM: string): string {
  const [year, month] = yyyyMM.split('-');
  return `T${parseInt(month, 10)}/${year}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color: string;
  icon: string;
}) {
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 10,
        padding: '18px 20px',
        border: '1px solid #e2e8f0',
        borderLeft: `4px solid ${color}`,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}
    >
      <div
        style={{
          width: 46,
          height: 46,
          borderRadius: 8,
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
        <div style={{ fontSize: 26, fontWeight: 700, color: '#1e293b', lineHeight: 1.1 }}>
          {value.toLocaleString('vi-VN')}
        </div>
        <div style={{ fontSize: 13, color: '#64748b', marginTop: 4, fontWeight: 500 }}>
          {label}
        </div>
      </div>
    </div>
  );
}

function HorizontalBarChart({
  title,
  data,
  labelKey,
  countKey,
  colors,
}: {
  title: string;
  data: Record<string, unknown>[];
  labelKey: string;
  countKey: string;
  colors?: string[];
}) {
  if (!data.length) {
    return (
      <div style={{ background: '#fff', borderRadius: 10, padding: 20, border: '1px solid #e2e8f0' }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 600, color: '#1e293b' }}>{title}</h3>
        <p style={{ color: '#94a3b8', textAlign: 'center', padding: '24px 0', fontSize: 13 }}>Không có dữ liệu</p>
      </div>
    );
  }

  const max = Math.max(...data.map((d) => d[countKey] as number), 1);

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 10,
        padding: 20,
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, color: '#1e293b' }}>{title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {data.map((row, idx) => {
          const label = (row[labelKey] as string) || 'Khác';
          const count = row[countKey] as number;
          const pct = Math.max((count / max) * 100, 2);
          const color = colors
            ? colors[idx] ?? PALETTE[idx % PALETTE.length]
            : PALETTE[idx % PALETTE.length];

          return (
            <div key={`${label}-${idx}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                <span style={{ color: '#334155', fontWeight: 500 }}>{label}</span>
                <span style={{ color: '#0f172a', fontWeight: 600 }}>{count.toLocaleString('vi-VN')}</span>
              </div>
              <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${pct}%`,
                    background: color,
                    borderRadius: 4,
                    transition: 'width 0.5s ease',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthlyTrendChart({ data }: { data: { month: string; count: number }[] }) {
  if (!data.length) return null;
  const W = 800;
  const H = 220;
  const PAD = { top: 20, right: 24, bottom: 36, left: 40 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;
  const maxVal = Math.max(...data.map((d) => d.count), 1);

  const pts = data.map((d, i) => ({
    x: PAD.left + (i / (data.length - 1 || 1)) * cW,
    y: PAD.top + cH - (d.count / maxVal) * cH,
    count: d.count,
    month: d.month,
  }));

  const polyline = pts.map((p) => `${p.x},${p.y}`).join(' ');
  const area = [
    `M ${pts[0].x} ${H - PAD.bottom}`,
    ...pts.map((p) => `L ${p.x} ${p.y}`),
    `L ${pts[pts.length - 1].x} ${H - PAD.bottom}`,
    'Z',
  ].join(' ');

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 10,
        padding: '18px 20px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: '#1e293b' }}>
        📈 Xu hướng theo tháng (12 tháng gần nhất)
      </h3>
      <div style={{ width: '100%', height: 240 }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', height: '100%', overflow: 'visible' }}
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <linearGradient id="incStatsGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0984e3" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#0984e3" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 0.25, 0.5, 0.75, 1].map((f) => {
            const y = PAD.top + cH - f * cH;
            return (
              <g key={f}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 3" />
                <text x={PAD.left - 8} y={y + 4} fontSize="11" fill="#94a3b8" textAnchor="end">
                  {Math.round(f * maxVal)}
                </text>
              </g>
            );
          })}
          <path d={area} fill="url(#incStatsGrad)" />
          <polyline points={polyline} fill="none" stroke="#0984e3" strokeWidth="2.5" strokeLinejoin="round" />
          {pts.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="4" fill="#0984e3" stroke="#fff" strokeWidth="2" />
              {p.count > 0 && (
                <text x={p.x} y={p.y - 8} fontSize="11" fill="#0984e3" textAnchor="middle" fontWeight="600">
                  {p.count}
                </text>
              )}
              <text
                x={p.x}
                y={H - PAD.bottom + 16}
                fontSize="11"
                fill="#64748b"
                textAnchor="middle"
                transform={data.length > 6 ? `rotate(-25 ${p.x} ${H - PAD.bottom + 14})` : undefined}
              >
                {formatMonth(p.month)}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

// ─── Trang chính: IncomingStatisticsPage ──────────────────────────────────────

type StatsData = {
  totalCount: number;
  byStatus: { status: string; count: number }[];
  byDocumentType: { documentType: string; count: number }[];
  byDepartment: { departmentId: number | null; departmentName: string; count: number }[];
  byMonth: { month: string; count: number }[];
};

export default function IncomingStatisticsPage() {
  const { user } = useAuth();
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    setHasSearched(true);
    try {
      const params: { dateFrom?: string; dateTo?: string } = {};
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      const res = await incomingDocumentsApi.getStatistics(params);
      setData(res.data.data ?? null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu thống kê');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setDateFrom('');
    setDateTo('');
    setData(null);
    setHasSearched(false);
    setError(null);
  };

  const statusData = (data?.byStatus ?? []).map((s) => ({
    label: STATUS_LABEL[s.status] ?? s.status,
    count: s.count,
    rawStatus: s.status,
  }));
  const statusColors = statusData.map((s) => STATUS_COLORS[s.rawStatus] ?? '#64748b');

  const docTypeData = (data?.byDocumentType ?? []).map((s) => ({
    label: s.documentType,
    count: s.count,
  }));

  const departmentData = (data?.byDepartment ?? []).map((s) => ({
    label: s.departmentName,
    count: s.count,
  }));

  const isSpecialistOnly =
    (user?.roles ?? []).includes('SPECIALIST') &&
    !(user?.roles ?? []).includes('ADMIN') &&
    !(user?.roles ?? []).includes('DEPARTMENT_HEAD') &&
    !(user?.roles ?? []).includes('DOCUMENT_CLERK');

  return (
    <>
      <div className="top-bar">
        <div>
          <h1 style={{ margin: 0 }}>Thống kê Văn bản đến</h1>
          <p style={{ margin: '4px 0 0', color: '#636e72', fontSize: 14 }}>
            Tổng hợp và phân tích số liệu văn bản đến theo khoảng thời gian
          </p>
        </div>
      </div>

      <div className="page-content">
        <div className="card">
          <div className="card-body" style={{ padding: 20 }}>
            {isSpecialistOnly && (
              <div
                style={{
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: 6,
                  padding: '10px 14px',
                  marginBottom: 16,
                  color: '#1e40af',
                  fontSize: 13,
                }}
              >
                ℹ️ Đang xem dữ liệu nội bộ phòng ban.
              </div>
            )}

            {/* Bộ lọc Từ ngày - Đến ngày */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                fetchStats();
              }}
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: '14px 18px',
                marginBottom: 20,
                display: 'flex',
                gap: 14,
                alignItems: 'flex-end',
                flexWrap: 'wrap',
              }}
            >
              <div>
                <label
                  htmlFor="incoming-stat-date-from"
                  style={{ display: 'block', fontSize: 13, color: '#334155', marginBottom: 4, fontWeight: 600 }}
                >
                  Từ ngày
                </label>
                <input
                  id="incoming-stat-date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  style={{ padding: '7px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, background: '#fff' }}
                />
              </div>

              <div>
                <label
                  htmlFor="incoming-stat-date-to"
                  style={{ display: 'block', fontSize: 13, color: '#334155', marginBottom: 4, fontWeight: 600 }}
                >
                  Đến ngày
                </label>
                <input
                  id="incoming-stat-date-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  style={{ padding: '7px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, background: '#fff' }}
                />
              </div>

              <button
                id="btn-incoming-filter-stats"
                type="submit"
                className="btn btn-primary"
                disabled={loading}
                style={{ padding: '8px 18px' }}
              >
                {loading ? 'Đang tải...' : 'Xem thống kê'}
              </button>

              {(dateFrom || dateTo) && (
                <button
                  id="btn-incoming-reset-stats"
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleReset}
                  disabled={loading}
                  style={{ padding: '8px 14px' }}
                >
                  ✕ Xóa lọc
                </button>
              )}
            </form>

            {/* Trạng thái chưa xem thống kê */}
            {!hasSearched && (
              <div
                style={{
                  textAlign: 'center',
                  padding: '60px 20px',
                  background: '#ffffff',
                  borderRadius: 8,
                  border: '1px dashed #cbd5e1',
                }}
              >
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    background: '#eff6ff',
                    color: '#3b82f6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 26,
                    margin: '0 auto 14px',
                  }}
                >
                  📥
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: '#1e293b', margin: '0 0 6px' }}>
                  Chọn khoảng thời gian để xem thống kê văn bản đến
                </h3>
                <p style={{ fontSize: 13, color: '#64748b', maxWidth: 480, margin: '0 auto', lineHeight: 1.5 }}>
                  Vui lòng chọn <strong>Từ ngày</strong> và <strong>Đến ngày</strong> ở bộ lọc bên trên, sau đó bấm nút <strong>"Xem thống kê"</strong> để hiển thị báo cáo chi tiết.
                </p>
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div style={{ padding: '40px 0' }}>
                <LoadingSpinner />
              </div>
            )}

            {/* Error */}
            {!loading && error && (
              <div
                style={{
                  background: '#fdf0f0',
                  border: '1px solid #fcc',
                  borderRadius: 8,
                  padding: 16,
                  color: '#e74c3c',
                  marginBottom: 20,
                }}
              >
                ⚠️ {error}
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={fetchStats}
                  style={{ marginLeft: 12, padding: '4px 10px', fontSize: 13 }}
                >
                  Thử lại
                </button>
              </div>
            )}

            {/* Nội dung kết quả */}
            {!loading && !error && hasSearched && data && (
              <>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 16,
                    marginBottom: 20,
                  }}
                >
                  <KpiCard label="Tổng văn bản đến" value={data.totalCount} color="#0984e3" icon="📥" />
                  <KpiCard label="Loại văn bản" value={data.byDocumentType.length} color="#fdcb6e" icon="🗂️" />
                  <KpiCard label="Phòng ban liên quan" value={data.byDepartment.length} color="#00b894" icon="🏢" />
                </div>

                <div style={{ marginBottom: 20 }}>
                  <MonthlyTrendChart data={data.byMonth} />
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                    gap: 16,
                  }}
                >
                  <HorizontalBarChart
                    title="📋 Phân bổ theo Trạng thái"
                    data={statusData as any}
                    labelKey="label"
                    countKey="count"
                    colors={statusColors}
                  />
                  <HorizontalBarChart
                    title="📁 Phân bổ theo Loại văn bản"
                    data={docTypeData as any}
                    labelKey="label"
                    countKey="count"
                  />
                  <HorizontalBarChart
                    title="🏢 Phân bổ theo Phòng ban liên quan"
                    data={departmentData as any}
                    labelKey="label"
                    countKey="count"
                  />
                </div>

                <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, marginTop: 16 }}>
                  * Thống kê dựa trên các văn bản đang hoạt động.
                  {dateFrom || dateTo
                    ? ` Khoảng thời gian: ${dateFrom || 'Từ trước'} → ${dateTo || 'Đến nay'}`
                    : ' Toàn bộ thời gian.'}
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
