import React, { useState } from 'react';
import { getOutgoingStatistics, OutgoingStatisticsData } from '../../../api/modules/outgoing-documents';
import { incomingDocumentsApi } from '../../../api/modules/documents';
import { useAuth } from '../../../contexts/AuthContext';
import { LoadingSpinner } from '../../../shared/components';

// ─── Types ────────────────────────────────────────────────────────────────────

type IncomingStatsData = {
  totalCount: number;
  byStatus: { status: string; count: number }[];
  byDocumentType: { documentType: string; count: number }[];
  byDepartment: { departmentId: number | null; departmentName: string; count: number }[];
  byMonth: { month: string; count: number }[];
};

// ─── Nhãn & Màu sắc ──────────────────────────────────────────────────────────

const INCOMING_STATUS_LABEL: Record<string, string> = {
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

const OUTGOING_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Bản nháp',
  SUBMITTED: 'Chờ duyệt',
  RETURNED: 'Trả lại',
  APPROVED: 'Đã duyệt',
  WAITING_FOR_ISSUE: 'Chờ phát hành',
  ISSUED: 'Đã phát hành',
  COMPLETED: 'Hoàn tất',
  RECALLED: 'Thu hồi',
  TRASHED: 'Thùng rác',
  REJECTED: 'Từ chối',
  CANCELLED: 'Đã hủy',
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#95a5a6',
  SUBMITTED: '#3498db',
  RETURNED: '#e67e22',
  APPROVED: '#27ae60',
  IN_PROGRESS: '#9b59b6',
  WAITING_FOR_ISSUE: '#9b59b6',
  ISSUED: '#2ecc71',
  COMPLETED: '#1abc9c',
  RECALLED: '#e74c3c',
  TRASHED: '#bdc3c7',
  REJECTED: '#c0392b',
  CANCELLED: '#7f8c8d',
  PENDING: '#f39c12',
};

const PALETTE = [
  '#4f46e5', '#06b6d4', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#3b82f6', '#14b8a6', '#f97316',
];

const INCOMING_COLOR = '#3b82f6';
const OUTGOING_COLOR = '#6366f1';

function formatMonth(yyyyMM: string) {
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
        background: '#ffffff',
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

function HBar({
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
      <div
        style={{
          background: '#ffffff',
          borderRadius: 10,
          padding: 20,
          border: '1px solid #e2e8f0',
        }}
      >
        <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 600, color: '#1e293b' }}>
          {title}
        </h3>
        <p style={{ color: '#94a3b8', textAlign: 'center', padding: '24px 0', fontSize: 13 }}>
          Không có dữ liệu
        </p>
      </div>
    );
  }

  const max = Math.max(...data.map((d) => d[countKey] as number), 1);

  return (
    <div
      style={{
        background: '#ffffff',
        borderRadius: 10,
        padding: 20,
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, color: '#1e293b' }}>
        {title}
      </h3>
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
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 4,
                  fontSize: 13,
                }}
              >
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

function TrendChart({
  data,
  color,
  gradId,
}: {
  data: { month: string; count: number }[];
  color: string;
  gradId: string;
}) {
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
    <div style={{ width: '100%', height: 240 }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: '100%', overflow: 'visible' }}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const y = PAD.top + cH - f * cH;
          return (
            <g key={f}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y}
                y2={y}
                stroke="#e2e8f0"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <text
                x={PAD.left - 8}
                y={y + 4}
                fontSize="11"
                fill="#94a3b8"
                textAnchor="end"
                fontFamily="sans-serif"
              >
                {Math.round(f * maxVal)}
              </text>
            </g>
          );
        })}
        <path d={area} fill={`url(#${gradId})`} />
        <polyline points={polyline} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="4" fill={color} stroke="#ffffff" strokeWidth="2" />
            {p.count > 0 && (
              <text
                x={p.x}
                y={p.y - 8}
                fontSize="11"
                fill={color}
                textAnchor="middle"
                fontWeight="600"
              >
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
  );
}

// ─── Bộ lọc Thời gian (Từ ngày - Đến ngày) ───────────────────────────────────

function DateFilter({
  loading,
  dateFrom,
  dateTo,
  onDateFrom,
  onDateTo,
  onFilter,
  onReset,
}: {
  loading: boolean;
  dateFrom: string;
  dateTo: string;
  onDateFrom: (v: string) => void;
  onDateTo: (v: string) => void;
  onFilter: () => void;
  onReset: () => void;
}) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onFilter();
  };

  return (
    <form
      onSubmit={handleSubmit}
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
          htmlFor="stat-date-from"
          style={{
            display: 'block',
            fontSize: 13,
            color: '#334155',
            marginBottom: 4,
            fontWeight: 600,
          }}
        >
          Từ ngày
        </label>
        <input
          id="stat-date-from"
          type="date"
          value={dateFrom}
          onChange={(e) => onDateFrom(e.target.value)}
          style={{
            padding: '7px 12px',
            border: '1px solid #cbd5e1',
            borderRadius: 6,
            fontSize: 14,
            background: '#ffffff',
          }}
        />
      </div>

      <div>
        <label
          htmlFor="stat-date-to"
          style={{
            display: 'block',
            fontSize: 13,
            color: '#334155',
            marginBottom: 4,
            fontWeight: 600,
          }}
        >
          Đến ngày
        </label>
        <input
          id="stat-date-to"
          type="date"
          value={dateTo}
          onChange={(e) => onDateTo(e.target.value)}
          style={{
            padding: '7px 12px',
            border: '1px solid #cbd5e1',
            borderRadius: 6,
            fontSize: 14,
            background: '#ffffff',
          }}
        />
      </div>

      <button
        type="submit"
        className="btn btn-primary"
        disabled={loading}
        style={{ padding: '8px 18px' }}
      >
        {loading ? 'Đang tải...' : 'Xem thống kê'}
      </button>

      {(dateFrom || dateTo) && (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onReset}
          disabled={loading}
          style={{ padding: '8px 14px' }}
        >
          ✕ Xóa lọc
        </button>
      )}
    </form>
  );
}

// ─── Initial Guide State (Khi chưa nhấn xem thống kê) ─────────────────────────

function InitialStateGuide({ title }: { title: string }) {
  return (
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
        📊
      </div>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: '#1e293b', margin: '0 0 6px' }}>
        Chọn khoảng thời gian để xem thống kê {title.toLowerCase()}
      </h3>
      <p style={{ fontSize: 13, color: '#64748b', maxWidth: 480, margin: '0 auto', lineHeight: 1.5 }}>
        Vui lòng chọn <strong>Từ ngày</strong> và <strong>Đến ngày</strong> ở bộ lọc bên trên, sau đó bấm nút <strong>"Xem thống kê"</strong> để hệ thống trích xuất và hiển thị dữ liệu báo cáo.
      </p>
    </div>
  );
}

// ─── Tab: Văn bản đến ─────────────────────────────────────────────────────────

function IncomingTab({ isSpecialistOnly }: { isSpecialistOnly: boolean }) {
  const [data, setData] = useState<IncomingStatsData | null>(null);
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
      const p: { dateFrom?: string; dateTo?: string } = {};
      if (dateFrom) p.dateFrom = dateFrom;
      if (dateTo) p.dateTo = dateTo;
      const res = await incomingDocumentsApi.getStatistics(p);
      setData(res.data.data ?? null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Không tải được dữ liệu thống kê');
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
    label: INCOMING_STATUS_LABEL[s.status] ?? s.status,
    count: s.count,
    rawStatus: s.status,
  }));
  const docTypeData = (data?.byDocumentType ?? []).map((s) => ({
    label: s.documentType,
    count: s.count,
  }));
  const deptData = (data?.byDepartment ?? []).map((s) => ({
    label: s.departmentName,
    count: s.count,
  }));

  const inProgressCount = (data?.byStatus ?? [])
    .filter((s) => ['IN_PROGRESS', 'PENDING', 'SUBMITTED'].includes(s.status))
    .reduce((acc, s) => acc + s.count, 0);

  const completedCount = (data?.byStatus ?? [])
    .filter((s) => s.status === 'COMPLETED')
    .reduce((acc, s) => acc + s.count, 0);

  return (
    <>
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
      <DateFilter
        loading={loading}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFrom={setDateFrom}
        onDateTo={setDateTo}
        onFilter={fetchStats}
        onReset={handleReset}
      />

      {/* Trạng thái chưa bấm Xem thống kê */}
      {!hasSearched && <InitialStateGuide title="Văn bản đến" />}

      {/* Đang tải */}
      {loading && (
        <div style={{ padding: '40px 0' }}>
          <LoadingSpinner />
        </div>
      )}

      {/* Lỗi */}
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

      {/* Dữ liệu thống kê hiển thị sau khi bấm */}
      {!loading && !error && hasSearched && data && (
        <>
          {/* KPI Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 16,
              marginBottom: 20,
            }}
          >
            <KpiCard
              label="Tổng văn bản đến"
              value={data.totalCount}
              color={INCOMING_COLOR}
              icon="📥"
            />
            <KpiCard
              label="Đang xử lý"
              value={inProgressCount}
              color="#f59e0b"
              icon="⏳"
            />
            <KpiCard
              label="Hoàn tất"
              value={completedCount}
              color="#10b981"
              icon="✅"
            />
            <KpiCard
              label="Loại văn bản"
              value={data.byDocumentType.length}
              color="#8b5cf6"
              icon="🗂️"
            />
          </div>

          {/* Biểu đồ xu hướng */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: 10,
              padding: '18px 20px',
              border: '1px solid #e2e8f0',
              marginBottom: 20,
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
          >
            <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: '#1e293b' }}>
              📈 Xu hướng theo tháng (12 tháng gần nhất)
            </h3>
            <TrendChart data={data.byMonth} color={INCOMING_COLOR} gradId="incGrad" />
          </div>

          {/* Biểu đồ phân bổ */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 16,
            }}
          >
            <HBar
              title="📋 Phân bổ theo Trạng thái"
              data={statusData as any}
              labelKey="label"
              countKey="count"
              colors={statusData.map((s) => STATUS_COLORS[s.rawStatus] ?? '#64748b')}
            />
            <HBar
              title="📁 Phân bổ theo Loại văn bản"
              data={docTypeData as any}
              labelKey="label"
              countKey="count"
            />
            <HBar
              title="🏢 Phân bổ theo Phòng ban liên quan"
              data={deptData as any}
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
    </>
  );
}

// ─── Tab: Văn bản đi ──────────────────────────────────────────────────────────

function OutgoingTab({ isSpecialistOnly }: { isSpecialistOnly: boolean }) {
  const [data, setData] = useState<OutgoingStatisticsData | null>(null);
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
      const p: { dateFrom?: string; dateTo?: string } = {};
      if (dateFrom) p.dateFrom = dateFrom;
      if (dateTo) p.dateTo = dateTo;
      const result = await getOutgoingStatistics(p);
      setData(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Không tải được dữ liệu thống kê');
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

  const issuanceRate =
    data && data.totalCount > 0
      ? Math.round((data.issuedCount / data.totalCount) * 100)
      : 0;

  const statusData = (data?.byStatus ?? []).map((s) => ({
    label: OUTGOING_STATUS_LABEL[s.status] ?? s.status,
    count: s.count,
    rawStatus: s.status,
  }));
  const docTypeData = (data?.byDocumentType ?? []).map((s) => ({
    label: s.documentType,
    count: s.count,
  }));
  const deptData = (data?.byDepartment ?? []).map((s) => ({
    label: s.departmentName,
    count: s.count,
  }));

  return (
    <>
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
      <DateFilter
        loading={loading}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFrom={setDateFrom}
        onDateTo={setDateTo}
        onFilter={fetchStats}
        onReset={handleReset}
      />

      {/* Trạng thái chưa bấm Xem thống kê */}
      {!hasSearched && <InitialStateGuide title="Văn bản đi" />}

      {/* Đang tải */}
      {loading && (
        <div style={{ padding: '40px 0' }}>
          <LoadingSpinner />
        </div>
      )}

      {/* Lỗi */}
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

      {/* Dữ liệu thống kê hiển thị sau khi bấm */}
      {!loading && !error && hasSearched && data && (
        <>
          {/* KPI Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 16,
              marginBottom: 20,
            }}
          >
            <KpiCard
              label="Tổng văn bản đi"
              value={data.totalCount}
              color={OUTGOING_COLOR}
              icon="📤"
            />
            <KpiCard
              label="Đã phát hành"
              value={data.issuedCount}
              color="#10b981"
              icon="✅"
            />
            <KpiCard
              label="Tỷ lệ phát hành (%)"
              value={issuanceRate}
              color="#06b6d4"
              icon="📈"
            />
            <KpiCard
              label="Loại văn bản"
              value={data.byDocumentType.length}
              color="#f59e0b"
              icon="🗂️"
            />
          </div>

          {/* Biểu đồ xu hướng */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: 10,
              padding: '18px 20px',
              border: '1px solid #e2e8f0',
              marginBottom: 20,
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
          >
            <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: '#1e293b' }}>
              📈 Xu hướng theo tháng (12 tháng gần nhất)
            </h3>
            <TrendChart data={data.byMonth} color={OUTGOING_COLOR} gradId="outGrad" />
          </div>

          {/* Biểu đồ phân bổ */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 16,
            }}
          >
            <HBar
              title="📋 Phân bổ theo Trạng thái"
              data={statusData as any}
              labelKey="label"
              countKey="count"
              colors={statusData.map((s) => STATUS_COLORS[s.rawStatus] ?? '#64748b')}
            />
            <HBar
              title="📁 Phân bổ theo Loại văn bản"
              data={docTypeData as any}
              labelKey="label"
              countKey="count"
            />
            <HBar
              title="🏢 Phân bổ theo Phòng ban soạn thảo"
              data={deptData as any}
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
    </>
  );
}

// ─── Trang chính: Thống kê Văn bản ───────────────────────────────────────────

type TabKey = 'incoming' | 'outgoing';

export default function DocumentStatisticsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>('incoming');

  const isSpecialistOnly =
    (user?.roles ?? []).includes('SPECIALIST') &&
    !(user?.roles ?? []).includes('ADMIN') &&
    !(user?.roles ?? []).includes('DEPARTMENT_HEAD') &&
    !(user?.roles ?? []).includes('DOCUMENT_CLERK');

  const tabs: { key: TabKey; label: string; color: string }[] = [
    { key: 'incoming', label: 'Văn bản đến', color: INCOMING_COLOR },
    { key: 'outgoing', label: 'Văn bản đi', color: OUTGOING_COLOR },
  ];

  return (
    <>
      {/* Top bar đồng bộ giao diện toàn hệ thống */}
      <div className="top-bar">
        <div>
          <h1 style={{ margin: 0 }}>Thống kê Văn bản</h1>
          <p style={{ margin: '4px 0 0', color: '#636e72', fontSize: 14 }}>
          </p>
        </div>
      </div>

      <div className="page-content">
        <div className="card">
          {/* Card Header với thanh Tab gạch chân đồng bộ */}
          <div
            className="card-header"
            style={{
              padding: '0 16px',
              borderBottom: '1px solid #dfe6e9',
              background: '#ffffff',
            }}
          >
            <div style={{ display: 'flex', gap: 8 }}>
              {tabs.map((tab) => {
                const active = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`tab-btn ${active ? 'active' : ''}`}
                    style={{
                      padding: '12px 20px',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: active ? `2px solid ${tab.color}` : '2px solid transparent',
                      color: active ? tab.color : '#636e72',
                      fontWeight: active ? 600 : 500,
                      fontSize: 14,
                      cursor: 'pointer',
                      marginBottom: -1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      transition: 'all 0.2s',
                    }}
                  >
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="card-body" style={{ padding: 20 }}>
            {activeTab === 'incoming' && <IncomingTab isSpecialistOnly={isSpecialistOnly} />}
            {activeTab === 'outgoing' && <OutgoingTab isSpecialistOnly={isSpecialistOnly} />}
          </div>
        </div>
      </div>
    </>
  );
}
