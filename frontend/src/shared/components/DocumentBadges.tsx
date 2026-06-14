import React from 'react';
import type { DocumentStatus, Priority } from '../../api';

const STATUS_CONFIG: Record<DocumentStatus, { label: string; className: string }> = {
  DRAFT: { label: 'Draft', className: 'status-draft' },
  PENDING: { label: 'Pending', className: 'status-pending' },
  IN_PROGRESS: { label: 'In Progress', className: 'status-in-progress' },
  COMPLETED: { label: 'Completed', className: 'status-completed' },
  REJECTED: { label: 'Rejected', className: 'status-rejected' },
  CANCELLED: { label: 'Cancelled', className: 'status-cancelled' },
};

export function DocumentStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status as DocumentStatus] ?? { label: status, className: 'status-draft' };
  return <span className={`doc-status-badge ${config.className}`}>{config.label}</span>;
}

const PRIORITY_CONFIG: Record<Priority, { label: string; className: string }> = {
  LOW: { label: 'Low', className: 'priority-low' },
  NORMAL: { label: 'Normal', className: 'priority-normal' },
  HIGH: { label: 'High', className: 'priority-high' },
  URGENT: { label: 'Urgent', className: 'priority-urgent' },
};

export function PriorityBadge({ priority }: { priority: string }) {
  const config = PRIORITY_CONFIG[priority as Priority] ?? { label: priority, className: 'priority-normal' };
  return <span className={`priority-badge ${config.className}`}>{config.label}</span>;
}
