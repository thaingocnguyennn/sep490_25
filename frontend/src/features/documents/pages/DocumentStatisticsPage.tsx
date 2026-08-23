import { useState, useEffect, useCallback } from 'react';
import { getOutgoingStatistics, OutgoingStatisticsData } from '../../../api/modules/outgoing-documents';
import { incomingDocumentsApi } from '../../../api/modules/documents';
import { useAuth } from '../../../contexts/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

type IncomingStatsData = {
  totalCount: number;
  byStatus: { status: string; count: number }[];
  byDocumentType: { documentType: string; count: number }[];
  byDepartment: { departmentId: number | null; departmentName: string; count: number }[];
  byMonth: { month: string; count: number }[];
};

// ─── Nhãn & màu ──────────────────────────────────────────────────────────────

const INCOMING_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Bản nháp', SUBMITTED: 'Chờ duyệt', RETURNED: 'Trả lại',
  APPROVED: 'Đã duyệt', IN_PROGRESS: 'Đang xử lý', COMPLETED: 'Hoàn tất',
  REJECTED: 'Từ chối', CANCELLED: 'Đã hủy', PENDING: 'Chờ xử lý',
};
const OUTGOING_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Bản nháp', SUBMITTED: 'Chờ duyệt', RETURNED: 'Trả lại',
  APPROVED: 'Đã duyệt', WAITING_FOR_ISSUE: 'Chờ phát hành',
  ISSUED: 'Đã phát hành', COMPLETED: 'Hoàn tất',
  RECALLED: 'Thu hồi', TRASHED: 'Thùng rác', REJECTED: 'Từ chối', CANCELLED: 'Đã hủy',
};
const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#95a5a6', SUBMITTED: '#3498db', RETURNED: '#e67e22', APPROVED: '#27ae60',
  IN_PROGRESS: '#9b59b6', WAITING_FOR_ISSUE: '#9b59b6', ISSUED: '#2ecc71',
  COMPLETED: '#1abc9c', RECALLED: '#e74c3c', TRASHED: '#bdc3c7',
  REJECTED: '#c0392b', CANCELLED: '#7f8c8d', PENDING: '#f39c12',
};
const PALETTE = [
  '#0984e3', '#00b894', '#6c5ce7', '#fdcb6e', '#e17055',
  '#fd79a8', '#55efc4', '#74b9ff', '#a29bfe', '#fab1a0',
];

const INCOMING_COLOR = '#0984e3';
const OUTGOING_COLOR = '#6c5ce7';

function formatMonth(yyyyMM: string) {
  const [year, month] = yyyyMM.split('-');
  return `T${parseInt(month)}/${year}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ label, value, color, icon }: {
  label: string; value: number; color: string; icon: string;
}) {
  return (
    <div style={{
      background: '#fff', borderRadius: 12, padding: '20px 24px',
      boxShadow: '0 2px 12px rgba(0,0,0,0.07)', borderLeft: `4px solid ${color}`,
      display: 'flex', alignItems: 'center', gap: 16,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: '50%', background: `${color}20`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: 28, fontWeight: 700, color: '#2d3436', lineHeight: 1 }}>
          {value.toLocaleString('vi-VN')}
        </div>
        <div style={{ fontSize: 13, color: '#636e72', marginTop: 4 }}>{label}</div>
      </div>
    </div>
  );
}

function HBar({ title, data, labelKey, countKey, colors }: {
  title: string;
  data: Record<string, unknown>[];
  labelKey: string;
  countKey: string;
  colors?: string[];
}) {
  if (!data.length) return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
      <h3 style={{ margin: '0 0 16px', fontSize: 16, color: '#2d3436' }}>{title}</h3>
      <p style={{ color: '#b2bec3', textAlign: 'center', padding: '24px 0' }}>Không có dữ liệu</p>
    </div>
  );
  const max = Math.max(...data.map((d) => d[countKey] as number), 1);
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
      <h3 style={{ margin: '0 0 20px', fontSize: 16, color: '#2d3436' }}>{title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {data.map((row, idx) => {
          const label = row[labelKey] as string;
          const count = row[countKey] as number;
          const pct = Math.max((count / max) * 100, 2);
          const color = colors ? (colors[idx] ?? PALETTE[idx % PALETTE.length]) : PALETTE[idx % PALETTE.length];
          return (
            <div key={`${label}-${idx}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                <span style={{ color: '#2d3436', fontWeight: 500 }}>{label}</span>
                <span style={{ color: '#636e72', fontWeight: 600 }}>{count}</span>
              </div>
              <div style={{ height: 10, background: '#f1f2f6', borderRadius: 6, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 6, transition: 'width 0.6s' }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TrendChart({ data, color, gradId }: {
  data: { month: string; count: number }[];
  color: string;
  gradId: string;
}) {
  if (!data.length) return null;
  const W = 800, H = 250;
  const PAD = { top: 20, right: 20, bottom: 40, left: 40 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;
  const maxVal = Math.max(...data.map((d) => d.count), 1);
  const pts = data.map((d, i) => ({
    x: PAD.left + (i / (data.length - 1 || 1)) * cW,
    y: PAD.top + cH - (d.count / maxVal) * cH,
    count: d.count, month: d.month,
  }));
  const polyline = pts.map((p) => `${p.x},${p.y}`).join(' ');
  const area = [
    `M ${pts[0].x} ${H - PAD.bottom}`,
    ...pts.map((p) => `L ${p.x} ${p.y}`),
    `L ${pts[pts.length - 1].x} ${H - PAD.bottom}`, 'Z',
  ].join(' ');
  return (
    <div style={{ width: '100%', height: 300 }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '100%', overflow: 'visible' }} preserveAspectRatio="xMidYMid meet">
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
              <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="#f1f2f6" strokeWidth="1" />
              <text x={PAD.left - 6} y={y + 4} fontSize="12" fill="#b2bec3" textAnchor="end">{Math.round(f * maxVal)}</text>
            </g>
          );
        })}
        <path d={area} fill={`url(#${gradId})`} />
        <polyline points={polyline} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="4.5" fill={color} stroke="#fff" strokeWidth="2" />
            {p.count > 0 && <text x={p.x} y={p.y - 10} fontSize="12" fill={color} textAnchor="middle" fontWeight="600">{p.count}</text>}
            <text x={p.x} y={H - PAD.bottom + 18} fontSize="12" fill="#636e72" textAnchor="middle"
              transform={data.length > 6 ? `rotate(-30 ${p.x} ${H - PAD.bottom + 14})` : undefined}>
              {formatMonth(p.month)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ─── Bộ lọc ───────────────────────────────────────────────────────────────────

function DateFilter({ loading, dateFrom, dateTo, onDateFrom, onDateTo, onFilter, onReset }: {
  loading: boolean;
  dateFrom: string;
  dateTo: string;
  onDateFrom: (v: string) => void;
  onDateTo: (v: string) => void;
  onFilter: () => void;
  onReset: () => void;
}) {
  return (
    <div style={{
      background: '#fff', borderRadius: 12, padding: '16px 20px',
      boxShadow: '0 2px 12px rgba(0,0,0,0.07)', marginBottom: 24,
      display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap',
    }}>
      <div>
        <label style={{ display: 'block', fontSize: 12, color: '#636e72', marginBottom: 4, fontWeight: 600 }}>Từ ngày</label>
        <input type="date" value={dateFrom} onChange={(e) => onDateFrom(e.target.value)}
          style={{ padding: '7px 12px', border: '1px solid #dfe6e9', borderRadius: 8, fontSize: 14 }} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: 12, color: '#636e72', marginBottom: 4, fontWeight: 600 }}>Đến ngày</label>
        <input type="date" value={dateTo} onChange={(e) => onDateTo(e.target.value)}
          style={{ padding: '7px 12px', border: '1px solid #dfe6e9', borderRadius: 8, fontSize: 14 }} />
      </div>
      <button className="btn btn-primary" onClick={onFilter} disabled={loading}>
        {loading ? '⏳ Đang tải...' : '🔍 Xem thống kê'}
      </button>
      {(dateFrom || dateTo) && (
        <button className="btn btn-secondary" onClick={onReset} disabled={loading}>✕ Xóa lọc</button>
      )}
    </div>
  );
}

// ─── Tab: Văn bản đến ─────────────────────────────────────────────────────────

function IncomingTab({ isSpecialistOnly }: { isSpecialistOnly: boolean }) {
  const [data, setData] = useState<IncomingStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetch = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const p: { dateFrom?: string; dateTo?: string } = {};
      if (dateFrom) p.dateFrom = dateFrom;
      if (dateTo) p.dateTo = dateTo;
      const res = await incomingDocumentsApi.getStatistics(p);
      setData(res.data.data ?? null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Không tải được dữ liệu');
    } finally { setLoading(false); }
  }, [dateFrom, dateTo]);

  useEffect(() => { fetch(); }, [fetch]);

  const statusData = (data?.byStatus ?? []).map((s) => ({
    label: INCOMING_STATUS_LABEL[s.status] ?? s.status, count: s.count, rawStatus: s.status,
  }));
  const docTypeData = (data?.byDocumentType ?? []).map((s) => ({ label: s.documentType, count: s.count }));
  const deptData = (data?.byDepartment ?? []).map((s) => ({ label: s.departmentName, count: s.count }));

  return (
    <>
      {isSpecialistOnly && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '12px 16px', marginBottom: 24, color: '#1e40af', fontSize: 14 }}>
          ℹ️ Đang xem dữ liệu nội bộ phòng ban.
        </div>
      )}
      <DateFilter loading={loading} dateFrom={dateFrom} dateTo={dateTo}
        onDateFrom={setDateFrom} onDateTo={setDateTo} onFilter={fetch} onReset={() => { setDateFrom(''); setDateTo(''); }} />

      {loading && <div style={{ textAlign: 'center', padding: '60px 0', color: '#636e72' }}><div style={{ fontSize: 32 }}>⏳</div><p>Đang tải...</p></div>}
      {!loading && error && (
        <div style={{ background: '#fdf0f0', border: '1px solid #fcc', borderRadius: 10, padding: 20, color: '#e74c3c' }}>
          ⚠️ {error} <button className="btn btn-secondary" onClick={fetch} style={{ marginLeft: 12 }}>Thử lại</button>
        </div>
      )}
      {!loading && !error && data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
            <KpiCard label="Tổng văn bản đến" value={data.totalCount} color={INCOMING_COLOR} icon="📥" />
            <KpiCard label="Loại văn bản" value={data.byDocumentType.length} color="#fdcb6e" icon="🗂️" />
            <KpiCard label="Phòng ban liên quan" value={data.byDepartment.length} color="#00b894" icon="🏢" />
          </div>

          <div style={{ background: '#fff', borderRadius: 12, padding: '20px 24px', boxShadow: '0 2px 12px rgba(0,0,0,0.07)', marginBottom: 20 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, color: '#2d3436' }}>📈 Xu hướng theo tháng (12 tháng gần nhất)</h3>
            <TrendChart data={data.byMonth} color={INCOMING_COLOR} gradId="incGrad" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            <HBar title="📋 Theo trạng thái" data={statusData as any} labelKey="label" countKey="count"
              colors={statusData.map((s) => STATUS_COLORS[s.rawStatus] ?? '#636e72')} />
            <HBar title="📁 Theo loại văn bản" data={docTypeData as any} labelKey="label" countKey="count" />
            <HBar title="🏢 Theo phòng ban (Top 10)" data={deptData as any} labelKey="label" countKey="count" />
          </div>

          <p style={{ textAlign: 'center', color: '#b2bec3', fontSize: 12, marginTop: 16 }}>
            * Chỉ thống kê văn bản đang hoạt động.
            {dateFrom || dateTo ? ` Kỳ: ${dateFrom || '…'} → ${dateTo || 'nay'}` : ' Toàn bộ thời gian.'}
          </p>
        </>
      )}
    </>
  );
}

// ─── Tab: Văn bản đi ──────────────────────────────────────────────────────────

function OutgoingTab({ isSpecialistOnly }: { isSpecialistOnly: boolean }) {
  const [data, setData] = useState<OutgoingStatisticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetch = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const p: { dateFrom?: string; dateTo?: string } = {};
      if (dateFrom) p.dateFrom = dateFrom;
      if (dateTo) p.dateTo = dateTo;
      const result = await getOutgoingStatistics(p);
      setData(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Không tải được dữ liệu');
    } finally { setLoading(false); }
  }, [dateFrom, dateTo]);

  useEffect(() => { fetch(); }, [fetch]);

  const issuanceRate = data && data.totalCount > 0
    ? Math.round((data.issuedCount / data.totalCount) * 100) : 0;

  const statusData = (data?.byStatus ?? []).map((s) => ({
    label: OUTGOING_STATUS_LABEL[s.status] ?? s.status, count: s.count, rawStatus: s.status,
  }));
  const docTypeData = (data?.byDocumentType ?? []).map((s) => ({ label: s.documentType, count: s.count }));
  const deptData = (data?.byDepartment ?? []).map((s) => ({ label: s.departmentName, count: s.count }));

  return (
    <>
      {isSpecialistOnly && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '12px 16px', marginBottom: 24, color: '#1e40af', fontSize: 14 }}>
          ℹ️ Đang xem dữ liệu nội bộ phòng ban.
        </div>
      )}
      <DateFilter loading={loading} dateFrom={dateFrom} dateTo={dateTo}
        onDateFrom={setDateFrom} onDateTo={setDateTo} onFilter={fetch} onReset={() => { setDateFrom(''); setDateTo(''); }} />

      {loading && <div style={{ textAlign: 'center', padding: '60px 0', color: '#636e72' }}><div style={{ fontSize: 32 }}>⏳</div><p>Đang tải...</p></div>}
      {!loading && error && (
        <div style={{ background: '#fdf0f0', border: '1px solid #fcc', borderRadius: 10, padding: 20, color: '#e74c3c' }}>
          ⚠️ {error} <button className="btn btn-secondary" onClick={fetch} style={{ marginLeft: 12 }}>Thử lại</button>
        </div>
      )}
      {!loading && !error && data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
            <KpiCard label="Tổng văn bản đi" value={data.totalCount} color={OUTGOING_COLOR} icon="📤" />
            <KpiCard label="Đã phát hành" value={data.issuedCount} color="#00b894" icon="✅" />
            <KpiCard label="Tỷ lệ phát hành (%)" value={issuanceRate} color="#0984e3" icon="📈" />
            <KpiCard label="Loại văn bản" value={data.byDocumentType.length} color="#fdcb6e" icon="🗂️" />
          </div>

          <div style={{ background: '#fff', borderRadius: 12, padding: '20px 24px', boxShadow: '0 2px 12px rgba(0,0,0,0.07)', marginBottom: 20 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, color: '#2d3436' }}>📈 Xu hướng theo tháng (12 tháng gần nhất)</h3>
            <TrendChart data={data.byMonth} color={OUTGOING_COLOR} gradId="outGrad" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            <HBar title="📋 Theo trạng thái" data={statusData as any} labelKey="label" countKey="count"
              colors={statusData.map((s) => STATUS_COLORS[s.rawStatus] ?? '#636e72')} />
            <HBar title="📁 Theo loại văn bản" data={docTypeData as any} labelKey="label" countKey="count" />
            <HBar title="🏢 Theo phòng ban (Top 10)" data={deptData as any} labelKey="label" countKey="count" />
          </div>

          <p style={{ textAlign: 'center', color: '#b2bec3', fontSize: 12, marginTop: 16 }}>
            * Chỉ thống kê văn bản đang hoạt động.
            {dateFrom || dateTo ? ` Kỳ: ${dateFrom || '…'} → ${dateTo || 'nay'}` : ' Toàn bộ thời gian.'}
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

  const tabs: { key: TabKey; label: string; icon: string; color: string }[] = [
    { key: 'incoming', label: 'Văn bản đến', icon: '', color: INCOMING_COLOR },
    { key: 'outgoing', label: 'Văn bản đi', icon: '', color: OUTGOING_COLOR },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      {/* Tiêu đề */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: '#2d3436' }}>
          Thống kê Văn bản
        </h1>
        <p style={{ margin: '4px 0 0', color: '#636e72', fontSize: 14 }}>
          Tổng hợp số liệu văn bản đến và văn bản đi trong hệ thống
        </p>
      </div>

      {/* Tab navigation */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 24,
        background: '#f8f9fa', borderRadius: 12, padding: 6,
        width: 'fit-content',
      }}>
        {tabs.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '10px 24px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontSize: 14, fontWeight: active ? 600 : 400,
                background: active ? '#fff' : 'transparent',
                color: active ? tab.color : '#636e72',
                boxShadow: active ? '0 2px 8px rgba(0,0,0,0.12)' : 'none',
                transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {active && (
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: tab.color, display: 'inline-block',
                }} />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'incoming' && <IncomingTab isSpecialistOnly={isSpecialistOnly} />}
      {activeTab === 'outgoing' && <OutgoingTab isSpecialistOnly={isSpecialistOnly} />}
    </div>
  );
}
