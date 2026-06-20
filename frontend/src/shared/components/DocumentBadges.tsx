import React from 'react';
import type { DocumentStatus, Priority } from '../../api';

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  // Trạng thái chung
  DRAFT:             { label: 'Bản nháp',          className: 'status-draft' },
  PENDING:           { label: 'Chờ xử lý',          className: 'status-pending' },
  IN_PROGRESS:       { label: 'Đang xử lý',         className: 'status-in-progress' },
  COMPLETED:         { label: 'Hoàn tất',            className: 'status-completed' },
  REJECTED:          { label: 'Từ chối',             className: 'status-rejected' },
  CANCELLED:         { label: 'Đã hủy',              className: 'status-cancelled' },
  // Trạng thái văn bản đi
  SUBMITTED:         { label: 'Chờ duyệt',           className: 'status-submitted' },
  RETURNED:          { label: 'Trả lại',             className: 'status-returned' },
  APPROVED:          { label: 'Đã duyệt',            className: 'status-approved' },
  WAITING_FOR_ISSUE: { label: 'Chờ phát hành',       className: 'status-waiting' },
  ISSUED:            { label: 'Đã phát hành',        className: 'status-issued' },
  RECALLED:          { label: 'Thu hồi',             className: 'status-recalled' },
  TRASHED:           { label: 'Thùng rác',           className: 'status-trashed' },
};

export function DocumentStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? { label: status, className: 'status-draft' };
  return <span className={`doc-status-badge ${config.className}`}>{config.label}</span>;
}

const PRIORITY_CONFIG: Record<Priority, { label: string; className: string }> = {
  LOW:    { label: 'Thấp',   className: 'priority-low' },
  NORMAL: { label: 'Bình thường', className: 'priority-normal' },
  HIGH:   { label: 'Cao',    className: 'priority-high' },
  URGENT: { label: 'Khẩn cấp', className: 'priority-urgent' },
};

export function PriorityBadge({ priority }: { priority: string }) {
  const config = PRIORITY_CONFIG[priority as Priority] ?? { label: priority, className: 'priority-normal' };
  return <span className={`priority-badge ${config.className}`}>{config.label}</span>;
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

