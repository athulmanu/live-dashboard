import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveStore } from './liveStore';
import type { TransportHandlers } from './transports';

const FLUSH_MS = 250;
let seq = 0;

const message = () =>
  JSON.stringify({
    id: `e${++seq}`,
    ts: Date.now(),
    service: 'auth',
    severity: 'info',
    status: 'ok',
    latencyMs: 10,
    message: 'ok',
  });

function setup(bufferSize = 1_000) {
  const connections: TransportHandlers[] = [];
  const store = new LiveStore(() => ({ open: (h) => connections.push(h), close: () => undefined }), {
    bufferSize,
    flushMs: FLUSH_MS,
  });
  const notify = vi.fn();
  store.subscribe(notify);
  store.start();
  const live = () => connections[connections.length - 1] as TransportHandlers;
  live().onOpen();
  const send = (count: number) => {
    for (let i = 0; i < count; i += 1) live().onMessage(message());
  };
  return { store, notify, live, send, snapshot: () => store.getSnapshot() };
}

describe('LiveStore', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('batches a burst of messages into a single update per flush', () => {
    const { notify, send, snapshot } = setup();
    notify.mockClear();

    send(500);
    expect(notify).not.toHaveBeenCalled();
    expect(snapshot().events).toHaveLength(0);

    vi.advanceTimersByTime(FLUSH_MS);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(snapshot().events).toHaveLength(500);
    expect(snapshot().stats.received).toBe(500);
  });

  it('caps memory and counts dropped messages under backpressure', () => {
    const { send, snapshot } = setup(100);
    send(250);
    vi.advanceTimersByTime(FLUSH_MS);

    expect(snapshot().events).toHaveLength(100);
    expect(snapshot().events.at(-1)?.id).toBe(`e${seq}`);
    expect(snapshot().stats.dropped).toBe(150);

    send(30);
    vi.advanceTimersByTime(FLUSH_MS);
    expect(snapshot().events).toHaveLength(100);
  });

  it('freezes the view while paused and applies queued events on resume', () => {
    const { store, send, snapshot } = setup();
    send(5);
    vi.advanceTimersByTime(FLUSH_MS);
    const frozen = snapshot().events;

    store.pause();
    expect(snapshot().connection.state).toBe('paused');
    send(10);
    vi.advanceTimersByTime(FLUSH_MS * 4);
    expect(snapshot().events).toBe(frozen);
    expect(snapshot().stats.queued).toBe(10);

    store.resume();
    expect(snapshot().events).toHaveLength(15);
    expect(snapshot().connection.state).toBe('live');
  });

  it('counts invalid messages as rejected without storing them', () => {
    const { live, snapshot } = setup();
    live().onMessage('<script>alert(1)</script>');
    live().onMessage('{"id":"x"}');
    vi.advanceTimersByTime(FLUSH_MS);

    expect(snapshot().events).toHaveLength(0);
    expect(snapshot().stats.rejected).toBe(2);
  });

  it('keeps the clock moving while live but freezes it while disconnected', () => {
    const { live, send, snapshot } = setup();
    send(1);
    vi.advanceTimersByTime(FLUSH_MS);
    const t0 = snapshot().updatedAt;

    vi.advanceTimersByTime(2_000);
    expect(snapshot().updatedAt).toBeGreaterThan(t0);

    live().onClose();
    expect(snapshot().connection.state).toBe('reconnecting');
    const t1 = snapshot().updatedAt;
    vi.advanceTimersByTime(2_000);
    expect(snapshot().updatedAt).toBe(t1);
  });
});
