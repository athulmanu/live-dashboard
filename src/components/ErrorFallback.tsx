import type { ReactNode } from 'react';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';

function PanelFallback({ resetErrorBoundary }: FallbackProps) {
  // Deliberately generic: error messages and stacks can contain stream data or internals.
  return (
    <div className="panel error-panel" role="alert">
      <p>
        <strong>This panel failed to render.</strong>
      </p>
      <p className="muted">The rest of the dashboard is unaffected.</p>
      <button type="button" className="btn" onClick={resetErrorBoundary}>
        Try again
      </button>
    </div>
  );
}

function AppFallback({ resetErrorBoundary }: FallbackProps) {
  return (
    <div className="app-error" role="alert">
      <h1>Something went wrong</h1>
      <p className="muted">The dashboard hit an unexpected error.</p>
      <div className="actions">
        <button type="button" className="btn btn-primary" onClick={resetErrorBoundary}>
          Try again
        </button>
        <button type="button" className="btn" onClick={() => window.location.reload()}>
          Reload page
        </button>
      </div>
    </div>
  );
}

/** Isolates one widget: a render error replaces only that panel, not the page. */
export function PanelBoundary({ children }: { children: ReactNode }) {
  return <ErrorBoundary FallbackComponent={PanelFallback}>{children}</ErrorBoundary>;
}

/** Last line of defence for errors outside any panel. */
export function AppBoundary({ children }: { children: ReactNode }) {
  return <ErrorBoundary FallbackComponent={AppFallback}>{children}</ErrorBoundary>;
}
