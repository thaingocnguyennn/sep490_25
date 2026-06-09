import React from 'react';

interface LoadingSpinnerProps {
  size?: number;
  className?: string;
}

export function LoadingSpinner({ size = 40, className = '' }: LoadingSpinnerProps) {
  return (
    <div className={`loading-spinner ${className}`}>
      <div className="spinner" style={{ width: size, height: size }} />
    </div>
  );
}
