import {
  TIME_WINDOWS,
  type Filters,
  type LiveEvent,
  type ServiceStatus,
  type Severity,
  type TimeWindowId,
} from '../types/event';

export function windowMs(id: TimeWindowId): number {
  return TIME_WINDOWS.find((w) => w.id === id)?.ms ?? Number.POSITIVE_INFINITY;
}

/** `now` is the time of the last applied update, so results stay stable while paused. */
export function filterEvents(events: readonly LiveEvent[], filters: Filters, now: number): LiveEvent[] {
  const since = now - windowMs(filters.windowId);
  const query = filters.search.trim().toLowerCase();
  return events.filter(
    (e) =>
      e.ts >= since &&
      filters.severities.has(e.severity) &&
      (query === '' || e.service.includes(query) || e.message.toLowerCase().includes(query)),
  );
}

export interface Kpis {
  total: number;
  ratePerSec: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  bySeverity: Record<Severity, number>;
  byStatus: Record<ServiceStatus, number>;
}

const RATE_WINDOW_MS = 10_000;

export function computeKpis(events: readonly LiveEvent[], now: number): Kpis {
  const bySeverity: Record<Severity, number> = { info: 0, warning: 0, critical: 0 };
  const byStatus: Record<ServiceStatus, number> = { ok: 0, degraded: 0, down: 0 };
  const latencies: number[] = [];
  let latencySum = 0;
  let recent = 0;

  for (const e of events) {
    bySeverity[e.severity] += 1;
    byStatus[e.status] += 1;
    latencySum += e.latencyMs;
    latencies.push(e.latencyMs);
    if (e.ts >= now - RATE_WINDOW_MS) recent += 1;
  }

  latencies.sort((a, b) => a - b);
  const p95 = latencies.length
    ? (latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))] ?? 0)
    : 0;

  return {
    total: events.length,
    ratePerSec: Math.round((recent / (RATE_WINDOW_MS / 1000)) * 10) / 10,
    avgLatencyMs: events.length ? Math.round(latencySum / events.length) : 0,
    p95LatencyMs: p95,
    bySeverity,
    byStatus,
  };
}

export interface ChartPoint {
  t: number;
  avgLatencyMs: number;
  count: number;
}

/** Buckets events per second; the output length is bounded by the event buffer cap. */
export function bucketBySecond(events: readonly LiveEvent[], maxPoints = 300): ChartPoint[] {
  const buckets = new Map<number, { sum: number; count: number }>();
  for (const e of events) {
    const t = Math.floor(e.ts / 1000) * 1000;
    const b = buckets.get(t);
    if (b) {
      b.sum += e.latencyMs;
      b.count += 1;
    } else {
      buckets.set(t, { sum: e.latencyMs, count: 1 });
    }
  }
  const points = [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([t, { sum, count }]) => ({ t, avgLatencyMs: Math.round(sum / count), count }));
  return points.length > maxPoints ? points.slice(points.length - maxPoints) : points;
}

export interface ViewCutoff {
  id: string;
  ts: number;
}

/**
 * For a newest-first list the user is reading: hides events that arrived after `cutoff` so rows don't move,
 * and reports how many are hidden. Filters still apply because `events` is already filtered. If the cutoff
 * event itself was filtered out, falls back to its timestamp.
 */
export function holdView(
  events: readonly LiveEvent[],
  cutoff: ViewCutoff | null,
): { visible: readonly LiveEvent[]; hidden: number } {
  if (!cutoff) return { visible: events, hidden: 0 };
  let index = events.findIndex((e) => e.id === cutoff.id);
  if (index === -1) {
    index = events.findIndex((e) => e.ts <= cutoff.ts);
    if (index === -1) index = events.length;
  }
  return { visible: index === 0 ? events : events.slice(index), hidden: index };
}

export function formatAge(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour12: false });
}
