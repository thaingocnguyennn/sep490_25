import React from 'react';
import type { UserStatus } from '../../types';

const STATUS_CONFIG: Record<UserStatus, { label: string; className: string }> = {
  ACTIVE: { label: 'Active', className: 'status-active' },
  INACTIVE: { label: 'Inactive', className: 'status-inactive' },
  LOCKED: { label: 'Locked', className: 'status-locked' },
};

interface StatusBadgeProps {
  status: UserStatus | string;
  className?: string;
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status as UserStatus] ?? { label: status, className: 'status-inactive' };
  return (
    <span className={`status-badge ${config.className} ${className}`}>
      {config.label}
    </span>
  );
}
