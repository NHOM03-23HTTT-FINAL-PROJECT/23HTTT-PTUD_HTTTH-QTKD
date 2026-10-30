import './StatusBadge.css';

export type BadgeTone = 'success' | 'warning' | 'info' | 'danger' | 'neutral' | 'accent';

type StatusBadgeProps = {
  label: string;
  tone?: BadgeTone;
};

/** Status Badge theo component Figma 1:211. */
export function StatusBadge({ label, tone = 'neutral' }: StatusBadgeProps) {
  return (
    <span className={`status-badge status-badge--${tone}`}>
      <span className="status-badge__dot" aria-hidden />
      {label}
    </span>
  );
}
