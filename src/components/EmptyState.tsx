import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: 'neutral' | 'danger';
}

export function EmptyState({ icon, title, description, action, tone = 'neutral' }: EmptyStateProps) {
  return (
    <div className={`empty-state tone-${tone}`}>
      {icon && (
        <span className="empty-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <h3>{title}</h3>
      {description && <p className="muted">{description}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}
