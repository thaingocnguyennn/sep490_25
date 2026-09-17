import React from 'react';
import type { DocumentStatus } from '../../api';

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  // Trạng thái chung (per-user workflow statuses)
  DRAFT:             { label: 'Bản nháp',          className: 'status-draft' },
  PENDING:           { label: 'Chờ xử lý',          className: 'status-pending' },
  IN_PROGRESS:       { label: 'Đang xử lý',         className: 'status-in-progress' },
  COMPLETED:         { label: 'Hoàn thành',         className: 'status-completed' },
  REJECTED:          { label: 'Trả lại',            className: 'status-rejected' },
  CANCELLED:         { label: 'Trả lại',            className: 'status-cancelled' },
  RETURNED:          { label: 'Trả lại',            className: 'status-returned' },
  // Trạng thái văn bản đi (kept for outgoing docs)
  SUBMITTED:         { label: 'Chờ duyệt',           className: 'status-submitted' },
  APPROVED:          { label: 'Đã duyệt',            className: 'status-approved' },
  WAITING_FOR_ISSUE: { label: 'Chờ phát hành',       className: 'status-waiting' },
  ISSUED:            { label: 'Đã phát hành',        className: 'status-issued' },
  RECALLED:          { label: 'Thu hồi',             className: 'status-recalled' },
  TRASHED:           { label: 'Đã xóa',           className: 'status-trashed' },
};

export function DocumentStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? { label: status, className: 'status-draft' };
  return <span className={`doc-status-badge ${config.className}`}>{config.label}</span>;
}

// Badge độ khẩn cho văn bản đi
// Accepts either a string (legacy) or a { name } object (new relational model).
const URGENCY_CONFIG: Record<string, { label: string; className: string }> = {
  THUONG:      { label: 'Thường',      className: 'urgency-thuong' },
  KHAN:        { label: 'Khẩn',        className: 'urgency-khan' },
  THUONG_KHAU: { label: 'Thượng khẩn', className: 'urgency-thuong-khau' },
  THUONG_KHAN: { label: 'Thượng khẩn', className: 'urgency-thuong-khau' },
  HOA_TOC:     { label: 'Hỏa tốc',    className: 'urgency-hoa-toc' },
};

export function UrgencyBadge({
  urgency,
}: {
  urgency: string | { name: string } | null | undefined;
}) {
  const name = !urgency
    ? null
    : typeof urgency === 'string'
      ? urgency
      : urgency.name;
  if (!name) return null;
  const config = URGENCY_CONFIG[name] ?? { label: name, className: 'urgency-thuong' };
  return <span className={`urgency-badge ${config.className}`}>{config.label}</span>;
}

