import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StreamClient, type TransportStatus } from './streamClient';
import type { TransportHandlers } from './transports';

/** A controllable fake transport: the test decides when it opens, sends and closes. */
function createFakeFactory() {
  const connections: TransportHandlers[] = [];
  const factory = () => ({
    open: (handlers: TransportHandlers) => connections.push(handlers),
    close: vi.fn(),
  });
  return { factory, connections, latest: () => connections[connections.length - 1] as TransportHandlers };
}

function setup(options = {}) {
  const fake = createFakeFactory();
  const statuses: TransportStatus[] = [];
  const sink = { onEvent: vi.fn(), onRejected: vi.fn(), onStatus: (s: TransportStatus) => statuses.push(s) };
  const client = new StreamClient(fake.factory, sink, {
    backoff: { baseMs: 100, maxMs: 1_000 },
    maxAttempts: 3,
    stableAfterMs: 1_000,
    ...options,
  });
  return { client, sink, fake, statuses, lastState: () => statuses[statuses.length - 1]?.state };
}

const validMessage = () =>
  JSON.stringify({
    id: 'a1',
    ts: Date.now(),
    service: 'auth',
    severity: 'info',
    status: 'ok',
    latencyMs: 5,
    message: 'hi',
  });

describe('StreamClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(1);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('goes connecting -> live and forwards only valid events', () => {
    const { client, sink, fake, lastState } = setup();
    client.connect();
    expect(lastState()).toBe('connecting');

    fake.latest().onOpen();
    expect(lastState()).toBe('live');

    fake.latest().onMessage(validMessage());
    fake.latest().onMessage('<script>alert(1)</script>');
    expect(sink.onEvent).toHaveBeenCalledTimes(1);
    expect(sink.onRejected).toHaveBeenCalledTimes(1);
  });

  it('reconnects with exponential backoff and gives up after maxAttempts', () => {
    const { client, fake, statuses, lastState } = setup();
    client.connect();
    fake.latest().onClose();
    expect(lastState()).toBe('reconnecting');

    vi.advanceTimersByTime(99);
    expect(fake.connections).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(fake.connections).toHaveLength(2);

    fake.latest().onClose();
    vi.advanceTimersByTime(200);
    expect(fake.connections).toHaveLength(3);

    fake.latest().onClose();
    vi.advanceTimersByTime(400);
    fake.latest().onClose();
    expect(lastState()).toBe('error');
    expect(statuses.at(-1)?.message).not.toMatch(/stack|Error:/);
  });

  it('does not reset backoff for a flapping connection', () => {
    const { client, fake, statuses } = setup();
    client.connect();
    fake.latest().onOpen();
    fake.latest().onClose();
    vi.advanceTimersByTime(100);
    fake.latest().onOpen();
    fake.latest().onClose();
    expect(statuses.at(-1)?.attempt).toBe(2);
  });

  it('ignores callbacks from a transport after disconnect', () => {
    const { client, sink, fake, lastState } = setup();
    client.connect();
    const stale = fake.latest();
    client.disconnect();
    stale.onOpen();
    stale.onMessage(validMessage());
    stale.onClose();
    expect(lastState()).toBe('idle');
    expect(sink.onEvent).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10_000);
    expect(fake.connections).toHaveLength(1);
  });
});
