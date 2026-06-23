import { useState, useEffect, useCallback } from 'react';
import {
  getOutgoingStatistics,
  OutgoingStatisticsData,
  OutgoingStatisticsParams,
} from '../../../api/modules/outgoing-documents';

// ─── Hằng số nhãn tiếng Việt ─────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  DRAFT:             'Bản nháp',
  SUBMITTED:         'Chờ duyệt',
  RETURNED:          'Trả lại',
  APPROVED:          'Đã duyệt',
  WAITING_FOR_ISSUE: 'Chờ phát hành',
  ISSUED:            'Đã phát hành',
  COMPLETED:         'Hoàn tất',
  RECALLED:          'Thu hồi',
  TRASHED:           'Thùng rác',
  REJECTED:          'Từ chối',
  CANCELLED:         'Đã hủy',
};

// Màu sắc cho từng trạng thái (dùng cho bar chart thủ công)
const STATUS_COLORS: Record<string, string> = {
  DRAFT:             '#95a5a6',
  SUBMITTED:         '#3498db',
  RETURNED:          '#e67e22',
  APPROVED:          '#27ae60',
  WAITING_FOR_ISSUE: '#9b59b6',
  ISSUED:            '#2ecc71',
  COMPLETED:         '#1abc9c',
  RECALLED:          '#e74c3c',
  TRASHED:           '#bdc3c7',
  REJECTED:          '#c0392b',
  CANCELLED:         '#7f8c8d',
};

// Màu sắc tuần hoàn cho biểu đồ tròn và cột
const PALETTE = [
  '#6c5ce7', '#00b894', '#0984e3', '#fdcb6e', '#e17055',
  '#fd79a8', '#55efc4', '#74b9ff', '#a29bfe', '#fab1a0',
];

// ─── Helper: format tháng "YYYY-MM" → "Tháng M/YYYY" ──────────────────────

function formatMonth(yyyyMM: string): string {
  const [year, month] = yyyyMM.split('-');
  return `T${parseInt(month)}/${year}`;
}

// ─── Sub-components ─────────────────────────────────────────────────────────

/** Card thống kê nhanh (KPI card) */
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
        borderRadius: 12,
        padding: '20px 24px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
        borderLeft: `4px solid ${color}`,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: `${color}20`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 22,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 28, fontWeight: 700, color: '#2d3436', lineHeight: 1 }}>
          {value.toLocaleString('vi-VN')}
        </div>
        <div style={{ fontSize: 13, color: '#636e72', marginTop: 4 }}>{label}</div>
      </div>
    </div>
  );
}

/** Biểu đồ cột nằm ngang (Horizontal Bar) — thuần CSS, không dùng thư viện */
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
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, color: '#2d3436' }}>{title}</h3>
        <p style={{ color: '#b2bec3', textAlign: 'center', padding: '24px 0' }}>Không có dữ liệu</p>
      </div>
    );
  }

  const max = Math.max(...data.map((d) => d[countKey] as number), 1);

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
      <h3 style={{ margin: '0 0 20px', fontSize: 16, color: '#2d3436' }}>{title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {data.map((row, idx) => {
          const label = row[labelKey] as string;
          const count = row[countKey] as number;
          const pct   = Math.max((count / max) * 100, 2); // min 2% để luôn hiện thanh
          const color = colors ? (colors[idx] ?? PALETTE[idx % PALETTE.length]) : PALETTE[idx % PALETTE.length];
          return (
            <div key={label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                <span style={{ color: '#2d3436', fontWeight: 500 }}>{label}</span>
                <span style={{ color: '#636e72', fontWeight: 600 }}>{count}</span>
              </div>
              <div style={{ height: 10, background: '#f1f2f6', borderRadius: 6, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${pct}%`,
                    background: color,
                    borderRadius: 6,
                    transition: 'width 0.6s cubic-bezier(.4,0,.2,1)',
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

/** Biểu đồ xu hướng theo tháng (Line chart dạng SVG đơn giản) */
function MonthlyTrendChart({ data }: { data: { month: string; count: number }[] }) {
  if (!data.length) return null;

  const W = 600;
  const H = 160;
  const PADDING = { top: 16, right: 16, bottom: 32, left: 32 };
  const chartW = W - PADDING.left - PADDING.right;
  const chartH = H - PADDING.top - PADDING.bottom;

  const maxVal = Math.max(...data.map((d) => d.count), 1);

  const points = data.map((d, i) => ({
    x: PADDING.left + (i / (data.length - 1 || 1)) * chartW,
    y: PADDING.top + chartH - (d.count / maxVal) * chartH,
    count: d.count,
    month: d.month,
  }));

  const polyline = points.map((p) => `${p.x},${p.y}`).join(' ');
  const areaPath = [
    `M ${points[0].x} ${H - PADDING.bottom}`,
    ...points.map((p) => `L ${p.x} ${p.y}`),
    `L ${points[points.length - 1].x} ${H - PADDING.bottom}`,
    'Z',
  ].join(' ');

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: '20px 24px', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 16, color: '#2d3436' }}>📈 Xu hướng theo tháng (12 tháng gần nhất)</h3>
      <div style={{ overflowX: 'auto' }}>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ minWidth: 320 }}>
          {/* Area gradient */}
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#6c5ce7" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#6c5ce7" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Y-axis grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
            const y = PADDING.top + chartH - frac * chartH;
            return (
              <g key={frac}>
                <line x1={PADDING.left} x2={W - PADDING.right} y1={y} y2={y} stroke="#f1f2f6" strokeWidth="1" />
                <text x={PADDING.left - 4} y={y + 4} fontSize="10" fill="#b2bec3" textAnchor="end">
                  {Math.round(frac * maxVal)}
                </text>
              </g>
            );
          })}

          {/* Area fill */}
          <path d={areaPath} fill="url(#areaGrad)" />

          {/* Line */}
          <polyline points={polyline} fill="none" stroke="#6c5ce7" strokeWidth="2.5" strokeLinejoin="round" />

          {/* Data points + labels X */}
          {points.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="4" fill="#6c5ce7" stroke="#fff" strokeWidth="2" />
              {/* Giá trị số trên điểm */}
              {p.count > 0 && (
                <text x={p.x} y={p.y - 8} fontSize="10" fill="#6c5ce7" textAnchor="middle" fontWeight="600">
                  {p.count}
                </text>
              )}
              {/* Label tháng */}
              <text
                x={p.x}
                y={H - PADDING.bottom + 14}
                fontSize="10"
                fill="#636e72"
                textAnchor="middle"
                transform={data.length > 6 ? `rotate(-30 ${p.x} ${H - PADDING.bottom + 14})` : undefined}
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

// ─── Trang Thống kê Văn bản đi ────────────────────────────────────────────────

export default function OutgoingStatisticsPage() {
  const [data, setData]       = useState<OutgoingStatisticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  // Bộ lọc thời gian
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: OutgoingStatisticsParams = {};
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo)   params.dateTo   = dateTo;
      const result = await getOutgoingStatistics(params);
      setData(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không tải được dữ liệu thống kê');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  // Tải dữ liệu lần đầu
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // ── Chuẩn bị dữ liệu cho từng biểu đồ ───────────────────────────────────

  const statusData = (data?.byStatus ?? []).map((s) => ({
    label: STATUS_LABEL[s.status] ?? s.status,
    count: s.count,
    rawStatus: s.status,
  }));

  const statusColors = statusData.map((s) => STATUS_COLORS[s.rawStatus] ?? '#636e72');

  const docTypeData = (data?.byDocumentType ?? []).map((s) => ({
    label: s.documentType,
    count: s.count,
  }));

  const departmentData = (data?.byDepartment ?? []).map((s) => ({
    label: s.departmentName,
    count: s.count,
  }));

  // ── Tỷ lệ phát hành ──────────────────────────────────────────────────────
  const issuanceRate =
    data && data.totalCount > 0
      ? Math.round((data.issuedCount / data.totalCount) * 100)
      : 0;

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      {/* ── Tiêu đề trang ──────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: '#2d3436' }}>
          📊 Thống kê Văn bản đi
        </h1>
        <p style={{ margin: '4px 0 0', color: '#636e72', fontSize: 14 }}>
          Tổng hợp số liệu và xu hướng văn bản đi trong hệ thống
        </p>
      </div>

      {/* ── Bộ lọc thời gian ───────────────────────────────────────────── */}
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: '16px 20px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
          marginBottom: 24,
          display: 'flex',
          gap: 12,
          alignItems: 'flex-end',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#636e72', marginBottom: 4, fontWeight: 600 }}>
            Từ ngày
          </label>
          <input
            id="stat-date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={{ padding: '7px 12px', border: '1px solid #dfe6e9', borderRadius: 8, fontSize: 14 }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#636e72', marginBottom: 4, fontWeight: 600 }}>
            Đến ngày
          </label>
          <input
            id="stat-date-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={{ padding: '7px 12px', border: '1px solid #dfe6e9', borderRadius: 8, fontSize: 14 }}
          />
        </div>
        <button
          id="btn-filter-stats"
          className="btn btn-primary"
          onClick={fetchStats}
          disabled={loading}
        >
          {loading ? '⏳ Đang tải...' : '🔍 Xem thống kê'}
        </button>
        {(dateFrom || dateTo) && (
          <button
            id="btn-reset-stats"
            className="btn btn-secondary"
            onClick={() => { setDateFrom(''); setDateTo(''); }}
            disabled={loading}
          >
            ✕ Xóa lọc
          </button>
        )}
      </div>

      {/* ── Trạng thái: Loading / Error ────────────────────────────────── */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#636e72' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
          <p>Đang tải dữ liệu thống kê...</p>
        </div>
      )}

      {!loading && error && (
        <div style={{ background: '#fdf0f0', border: '1px solid #fcc', borderRadius: 10, padding: 20, color: '#e74c3c' }}>
          ⚠️ {error}
          <button
            className="btn btn-secondary"
            onClick={fetchStats}
            style={{ marginLeft: 12 }}
          >
            Thử lại
          </button>
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* ── KPI Cards ──────────────────────────────────────────────── */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 16,
              marginBottom: 24,
            }}
          >
            <KpiCard label="Tổng văn bản đi"       value={data.totalCount}  color="#6c5ce7" icon="📄" />
            <KpiCard label="Đã phát hành"           value={data.issuedCount} color="#00b894" icon="✅" />
            <KpiCard
              label="Tỷ lệ phát hành"
              value={issuanceRate}
              color="#0984e3"
              icon="📈"
            />
            <KpiCard
              label="Loại văn bản khác nhau"
              value={data.byDocumentType.length}
              color="#fdcb6e"
              icon="🗂️"
            />
          </div>

          {/* ── Biểu đồ xu hướng tháng ─────────────────────────────────── */}
          <div style={{ marginBottom: 20 }}>
            <MonthlyTrendChart data={data.byMonth} />
          </div>

          {/* ── Biểu đồ cột ────────────────────────────────────────────── */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
              gap: 16,
              marginBottom: 24,
            }}
          >
            <HorizontalBarChart
              title="📋 Theo trạng thái"
              data={statusData as any}
              labelKey="label"
              countKey="count"
              colors={statusColors}
            />
            <HorizontalBarChart
              title="📁 Theo loại văn bản"
              data={docTypeData as any}
              labelKey="label"
              countKey="count"
            />
            <HorizontalBarChart
              title="🏢 Theo phòng ban (Top 10)"
              data={departmentData as any}
              labelKey="label"
              countKey="count"
            />
          </div>

          {/* ── Ghi chú ────────────────────────────────────────────────── */}
          <p style={{ textAlign: 'center', color: '#b2bec3', fontSize: 12, marginTop: 8 }}>
            * Chỉ thống kê văn bản đang hoạt động (không tính văn bản đã xóa).
            {dateFrom || dateTo ? ` Kỳ: ${dateFrom || '…'} → ${dateTo || 'nay'}` : ' Toàn bộ thời gian.'}
          </p>
        </>
      )}
    </div>
  );
}
