import React from 'react';

interface RoleBadgeProps {
  name: string;
  className?: string;
}

export function RoleBadge({ name, className = '' }: RoleBadgeProps) {
  return (
    <span className={`role-badge ${className}`}>
      {name}
    </span>
  );
}
