const KPI_PLACEHOLDERS = 6;
const ROW_PLACEHOLDERS = 8;

/** Skeleton in the shape of the dashboard, so nothing jumps when the first data arrives. */
export function Loading({ label = 'Connecting to the live feed…' }: { label?: string }) {
  return (
    <div className="skeleton-dashboard" aria-busy="true">
      <div className="loading-status" role="status" aria-live="polite">
        <span className="spinner" aria-hidden="true" />
        <span>{label}</span>
      </div>
      <div className="kpi-grid" aria-hidden="true">
        {Array.from({ length: KPI_PLACEHOLDERS }, (_, i) => (
          <div key={i} className="kpi-card skeleton-card">
            <span className="skeleton skeleton-label" />
            <span className="skeleton skeleton-value" />
            <span className="skeleton skeleton-hint" />
          </div>
        ))}
      </div>
      <div className="main-grid" aria-hidden="true">
        <div className="panel">
          <span className="skeleton skeleton-title" />
          <span className="skeleton skeleton-chart" />
        </div>
        <div className="panel">
          <span className="skeleton skeleton-title" />
          {Array.from({ length: ROW_PLACEHOLDERS }, (_, i) => (
            <span key={i} className="skeleton skeleton-row" />
          ))}
        </div>
      </div>
    </div>
  );
}
