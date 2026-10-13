import { memo } from 'react';
import { useLiveSelector, useLiveStreamContext } from '../hooks/useLiveStream';
import { useNow } from '../hooks/useNow';
import type { ConnectionState } from '../types/event';
import { PauseIcon, PlayIcon, RetryIcon } from './Icons';

const LABELS: Record<ConnectionState, string> = {
  connecting: 'Connecting',
  live: 'Live',
  paused: 'Paused',
  reconnecting: 'Reconnecting',
  error: 'Disconnected',
};

function ConnectionBarImpl() {
  const { store } = useLiveStreamContext();
  const connection = useLiveSelector((s) => s.connection);
  const stats = useLiveSelector((s) => s.stats);
  const paused = useLiveSelector((s) => s.paused);
  const now = useNow(connection.retryAt !== null);

  const retryIn = connection.retryAt ? Math.max(0, Math.ceil((connection.retryAt - now) / 1000)) : null;
  const canRetry = connection.state === 'error' || connection.state === 'reconnecting';

  return (
    <section className={`connection-bar state-${connection.state}`} aria-label="Connection">
      <div className="connection-status">
        {/* Only state changes are announced; ticking counters below are visual only. */}
        <span className={`status-pill status-${connection.state}`} role="status">
          <span className="status-dot" aria-hidden="true" />
          {LABELS[connection.state]}
        </span>
        <span className="connection-detail">
          {connection.message && <span className="muted">{connection.message}</span>}
          {retryIn !== null && (
            <span className="muted" aria-hidden="true">
              Attempt {connection.attempt} · retrying in {retryIn}s
            </span>
          )}
          {paused && (
            <span className="badge" aria-hidden="true">
              {stats.queued > 0 ? `${stats.queued.toLocaleString()} new events queued` : 'View frozen'}
            </span>
          )}
        </span>
      </div>

      <dl className="stream-stats">
        <div title="Messages that passed validation">
          <dt>Accepted</dt>
          <dd>{stats.received.toLocaleString()}</dd>
        </div>
        <div title="Messages that failed validation and were discarded">
          <dt>Rejected</dt>
          <dd className={stats.rejected > 0 ? 'warn' : undefined}>{stats.rejected.toLocaleString()}</dd>
        </div>
        <div title="Messages dropped under backpressure (buffer full)">
          <dt>Dropped</dt>
          <dd className={stats.dropped > 0 ? 'warn' : undefined}>{stats.dropped.toLocaleString()}</dd>
        </div>
      </dl>

      <div className="actions">
        {canRetry && (
          <button type="button" className="btn" onClick={() => store.retry()}>
            <RetryIcon />
            Retry now
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => (paused ? store.resume() : store.pause())}
          aria-pressed={paused}
        >
          {paused ? <PlayIcon /> : <PauseIcon />}
          {paused ? 'Resume' : 'Pause'}
        </button>
      </div>
    </section>
  );
}

export const ConnectionBar = memo(ConnectionBarImpl);
