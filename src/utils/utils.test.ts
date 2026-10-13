import { describe, expect, it } from 'vitest';
import type { LiveEvent } from '../types/event';
import { backoffDelay } from './backoff';
import { appendCapped } from './buffer';
import { bucketBySecond, computeKpis, filterEvents, holdView } from './helpers';

const NOW = 1_700_000_000_000;
const event = (overrides: Partial<LiveEvent> = {}): LiveEvent => ({
  id: Math.random().toString(36).slice(2),
  ts: NOW,
  service: 'auth',
  severity: 'info',
  status: 'ok',
  latencyMs: 100,
  message: 'ok',
  ...overrides,
});

describe('appendCapped', () => {
  it('keeps only the newest `cap` items', () => {
    expect(appendCapped([1, 2, 3], [4, 5], 4)).toEqual([2, 3, 4, 5]);
    expect(appendCapped([1], [2, 3, 4, 5, 6], 3)).toEqual([4, 5, 6]);
    expect(appendCapped([1, 2], [], 5)).toEqual([1, 2]);
    expect(appendCapped([1, 2], [3], 0)).toEqual([]);
  });

  it('does not mutate its inputs', () => {
    const existing = [1, 2, 3];
    appendCapped(existing, [4], 2);
    expect(existing).toEqual([1, 2, 3]);
  });
});

describe('holdView', () => {
  const newestFirst = [
    event({ id: 'e4', ts: NOW + 4 }),
    event({ id: 'e3', ts: NOW + 3 }),
    event({ id: 'e2', ts: NOW + 2 }),
    event({ id: 'e1', ts: NOW + 1 }),
  ];

  it('shows everything when live', () => {
    expect(holdView(newestFirst, null)).toEqual({ visible: newestFirst, hidden: 0 });
  });

  it('hides events newer than the cutoff so the top row stays put', () => {
    const { visible, hidden } = holdView(newestFirst, { id: 'e2', ts: NOW + 2 });
    expect(visible.map((e) => e.id)).toEqual(['e2', 'e1']);
    expect(hidden).toBe(2);
  });

  it('falls back to the timestamp when the cutoff event was filtered out', () => {
    const filtered = newestFirst.filter((e) => e.id !== 'e2');
    const { visible, hidden } = holdView(filtered, { id: 'e2', ts: NOW + 2 });
    expect(visible.map((e) => e.id)).toEqual(['e1']);
    expect(hidden).toBe(2);
  });
});

describe('backoffDelay', () => {
  const opts = { baseMs: 500, maxMs: 10_000 };

  it('grows exponentially up to the cap', () => {
    expect(backoffDelay(0, opts, () => 1)).toBe(500);
    expect(backoffDelay(1, opts, () => 1)).toBe(1_000);
    expect(backoffDelay(3, opts, () => 1)).toBe(4_000);
    expect(backoffDelay(20, opts, () => 1)).toBe(10_000);
  });

  it('applies jitter within [base, ceiling]', () => {
    expect(backoffDelay(3, opts, () => 0)).toBe(500);
    expect(backoffDelay(3, opts, () => 0.5)).toBe(2_250);
  });
});

describe('filterEvents / computeKpis / bucketBySecond', () => {
  const events = [
    event({ ts: NOW - 120_000, severity: 'critical', status: 'down', latencyMs: 900 }),
    event({ ts: NOW - 5_000, severity: 'warning', status: 'degraded', latencyMs: 300, service: 'billing' }),
    event({ ts: NOW - 1_000, latencyMs: 100 }),
    event({ ts: NOW - 500, latencyMs: 200 }),
  ];
  const all = new Set(['info', 'warning', 'critical'] as const);

  it('applies the time window relative to the given time', () => {
    expect(filterEvents(events, { windowId: '1m', severities: all, search: '' }, NOW)).toHaveLength(3);
    expect(filterEvents(events, { windowId: '5m', severities: all, search: '' }, NOW)).toHaveLength(4);
  });

  it('filters by severity and search', () => {
    expect(filterEvents(events, { windowId: 'all', severities: new Set(['critical']), search: '' }, NOW)).toHaveLength(
      1,
    );
    expect(filterEvents(events, { windowId: 'all', severities: all, search: 'BILL' }, NOW)).toHaveLength(1);
  });

  it('derives KPIs', () => {
    const kpis = computeKpis(events, NOW);
    expect(kpis.total).toBe(4);
    expect(kpis.byStatus).toEqual({ ok: 2, degraded: 1, down: 1 });
    expect(kpis.avgLatencyMs).toBe(375);
    expect(kpis.ratePerSec).toBe(0.3);
    expect(computeKpis([], NOW).avgLatencyMs).toBe(0);
  });

  it('buckets per second in time order', () => {
    const points = bucketBySecond([
      event({ ts: NOW + 10 }),
      event({ ts: NOW + 20, latencyMs: 300 }),
      event({ ts: NOW - 2_000 }),
    ]);
    expect(points.map((p) => p.count)).toEqual([1, 2]);
    expect(points[1]?.avgLatencyMs).toBe(200);
  });
});
