import { useMemo } from 'react';
import { useFilters } from '../hooks/useFilters';
import { useLiveSelector, useLiveStreamContext } from '../hooks/useLiveStream';
import type { ConnectionState } from '../types/event';
import { bucketBySecond, computeKpis, filterEvents, windowMs } from '../utils/helpers';
import { EmptyState } from './EmptyState';
import { PanelBoundary } from './ErrorFallback';
import { EventsList } from './EventsList';
import { FilterBar } from './FilterBar';
import { FilterIcon, OfflineIcon, RetryIcon } from './Icons';
import { KpiCards } from './KpiCards';
import { LiveChart } from './LiveChart';
import { Loading } from './Loading';
import { StaleBanner } from './StaleBanner';

const STALE_STATES: ReadonlySet<ConnectionState> = new Set(['connecting', 'reconnecting', 'error']);

/**
 * Subscribes to the event buffer and derives everything else from it; nothing derived is stored
 * in state. Re-renders at most once per flush interval, never once per message.
 */
export function Dashboard() {
  const { store } = useLiveStreamContext();
  const events = useLiveSelector((s) => s.events);
  const updatedAt = useLiveSelector((s) => s.updatedAt);
  const hasReceivedData = useLiveSelector((s) => s.hasReceivedData);
  const lastEventAt = useLiveSelector((s) => s.lastEventAt);
  const connectionState = useLiveSelector((s) => s.connection.state);
  const bufferSize = useLiveSelector((s) => s.config.bufferSize);
  const filterControls = useFilters();
  const { filters, isFiltered, reset } = filterControls;

  const filtered = useMemo(() => filterEvents(events, filters, updatedAt), [events, filters, updatedAt]);
  const kpis = useMemo(() => computeKpis(filtered, updatedAt), [filtered, updatedAt]);
  const points = useMemo(() => bucketBySecond(filtered), [filtered]);
  const newestFirst = useMemo(() => filtered.slice().reverse(), [filtered]);
  const oldestTs = events[0]?.ts ?? updatedAt;
  const bufferLimited = events.length >= bufferSize && oldestTs > updatedAt - windowMs(filters.windowId);
  const stale = hasReceivedData && STALE_STATES.has(connectionState);

  if (!hasReceivedData) {
    if (connectionState === 'error') {
      return (
        <div className="panel">
          <EmptyState
            tone="danger"
            icon={<OfflineIcon />}
            title="Unable to reach the live feed"
            description="No data has been received yet. Check your connection, then retry."
            action={
              <button type="button" className="btn btn-primary" onClick={() => store.retry()}>
                <RetryIcon />
                Retry now
              </button>
            }
          />
        </div>
      );
    }
    return <Loading label={connectionState === 'live' ? 'Connected. Waiting for the first events…' : undefined} />;
  }

  return (
    <>
      {stale && lastEventAt !== null && <StaleBanner lastEventAt={lastEventAt} />}
      <FilterBar {...filterControls} />
      <div className={stale ? 'live-content is-stale' : 'live-content'}>
        <PanelBoundary>
          <KpiCards kpis={kpis} bufferLimited={bufferLimited} />
        </PanelBoundary>
        {filtered.length === 0 ? (
          <div className="panel">
            <EmptyState
              icon={<FilterIcon />}
              title={isFiltered ? 'No events match your filters' : 'No events in this time window'}
              description={
                isFiltered
                  ? 'Try a wider time window, more severities, or a different search.'
                  : 'The feed is connected but quiet. New events will appear here as they arrive.'
              }
              action={
                isFiltered && (
                  <button type="button" className="btn" onClick={reset}>
                    Reset filters
                  </button>
                )
              }
            />
          </div>
        ) : (
          <div className="main-grid">
            <PanelBoundary>
              <LiveChart points={points} />
            </PanelBoundary>
            <PanelBoundary>
              <EventsList events={newestFirst} />
            </PanelBoundary>
          </div>
        )}
      </div>
    </>
  );
}
