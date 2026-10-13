import type { ConnectionInfo, ConnectionState, LiveEvent, StreamStats, TransportState } from '../types/event';
import { appendCapped } from '../utils/buffer';
import { StreamClient, type TransportStatus } from './streamClient';
import type { TransportFactory } from './transports';

export interface StreamConfig {
  /** Max events kept in memory (also the cap on events queued while paused). */
  bufferSize: number;
  /** How often queued messages are applied to the UI. One render per flush, not per message. */
  flushMs: number;
}

const DEFAULT_CONFIG: StreamConfig = { bufferSize: 2_000, flushMs: 250 };

export interface LiveSnapshot {
  events: readonly LiveEvent[];
  /** Time of the last applied update. Used as "now" for time windows so a paused view stays stable. */
  updatedAt: number;
  connection: ConnectionInfo;
  stats: StreamStats & { queued: number };
  paused: boolean;
  config: StreamConfig;
  hasReceivedData: boolean;
  /** When the last batch of real events was applied; null until the first one. */
  lastEventAt: number | null;
}

/** Wall-clock refresh while a live feed is quiet, so time windows still move forward. */
const IDLE_CLOCK_MS = 1_000;

function toConnectionState(transport: TransportState, paused: boolean): ConnectionState {
  switch (transport) {
    case 'live':
      return paused ? 'paused' : 'live';
    case 'idle':
    case 'connecting':
      return 'connecting';
    case 'reconnecting':
      return 'reconnecting';
    case 'error':
      return 'error';
    default: {
      const unreachable: never = transport;
      return unreachable;
    }
  }
}

/**
 * An external store (used through useSyncExternalStore) between the stream client and React.
 * Messages land in a mutable queue; a timer applies them in batches, producing a new immutable
 * snapshot at most once per `flushMs`.
 */
export class LiveStore {
  private readonly listeners = new Set<() => void>();
  private readonly client: StreamClient;
  private queue: LiveEvent[] = [];
  private counters: StreamStats = { received: 0, rejected: 0, dropped: 0 };
  private transport: TransportStatus = { state: 'idle', attempt: 0, retryAt: null, message: null };
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private snapshot: LiveSnapshot;

  constructor(createTransport: TransportFactory, config: StreamConfig = DEFAULT_CONFIG) {
    this.snapshot = {
      events: [],
      updatedAt: Date.now(),
      connection: { state: 'connecting', attempt: 0, retryAt: null, message: null },
      stats: { ...this.counters, queued: 0 },
      paused: false,
      config,
      hasReceivedData: false,
      lastEventAt: null,
    };
    this.client = new StreamClient(createTransport, {
      onEvent: (event) => this.enqueue(event),
      onRejected: () => {
        this.counters.rejected += 1;
      },
      onStatus: (status) => {
        this.transport = status;
        this.publishConnection();
      },
    });
  }

  // --- useSyncExternalStore contract ------------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): LiveSnapshot => this.snapshot;

  // --- lifecycle and controls ---------------------------------------------------------------

  start(): void {
    this.client.connect();
    this.restartFlushTimer();
  }

  stop(): void {
    this.client.disconnect();
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = null;
  }

  pause(): void {
    this.update({ paused: true });
    this.publishConnection();
  }

  resume(): void {
    this.update({ paused: false });
    this.publishConnection();
    this.flush();
  }

  retry(): void {
    this.client.retryNow();
  }

  clear(): void {
    this.queue = [];
    this.counters = { received: 0, rejected: 0, dropped: 0 };
    this.update({
      events: [],
      stats: { ...this.counters, queued: 0 },
      updatedAt: Date.now(),
      hasReceivedData: false,
      lastEventAt: null,
    });
  }

  setConfig(partial: Partial<StreamConfig>): void {
    const config = { ...this.snapshot.config, ...partial };
    const events =
      this.snapshot.events.length > config.bufferSize
        ? this.snapshot.events.slice(this.snapshot.events.length - config.bufferSize)
        : this.snapshot.events;
    this.update({ config, events });
    if (this.flushTimer) this.restartFlushTimer();
  }

  // --- internals ----------------------------------------------------------------------------

  private enqueue(event: LiveEvent): void {
    this.counters.received += 1;
    this.queue.push(event);
    // Trimmed only at 2x the cap so pushes stay O(1) on average; flush trims to exactly the cap.
    if (this.queue.length > this.snapshot.config.bufferSize * 2) this.trimQueue();
  }

  /**
   * Backpressure: keeps only the newest `bufferSize` queued events (bursts, a long pause, or a
   * background tab) and counts the rest as dropped.
   */
  private trimQueue(): void {
    const cap = this.snapshot.config.bufferSize;
    if (this.queue.length <= cap) return;
    this.counters.dropped += this.queue.length - cap;
    this.queue = this.queue.slice(this.queue.length - cap);
  }

  private flush = (): void => {
    this.trimQueue();
    const { config, paused, stats, events, updatedAt } = this.snapshot;
    const cap = config.bufferSize;

    const queued = paused ? this.queue.length : 0;
    const statsChanged =
      stats.received !== this.counters.received ||
      stats.rejected !== this.counters.rejected ||
      stats.dropped !== this.counters.dropped ||
      stats.queued !== queued;
    const nextStats = statsChanged ? { ...this.counters, queued } : stats;

    if (paused || this.queue.length === 0) {
      const now = Date.now();
      // While disconnected the clock stops too, so the view stays consistent with "data as of <time>".
      const clockDue = !paused && this.transport.state === 'live' && now - updatedAt >= IDLE_CLOCK_MS;
      if (statsChanged || clockDue) this.update({ stats: nextStats, ...(clockDue ? { updatedAt: now } : {}) });
      return;
    }

    const batch = this.queue;
    this.queue = [];
    const now = Date.now();
    this.update({
      events: appendCapped(events, batch, cap),
      updatedAt: now,
      stats: nextStats,
      hasReceivedData: true,
      lastEventAt: now,
    });
  };

  private publishConnection(): void {
    const { state, attempt, retryAt, message } = this.transport;
    const next: ConnectionInfo = {
      state: toConnectionState(state, this.snapshot.paused),
      attempt,
      retryAt,
      message,
    };
    const prev = this.snapshot.connection;
    if (
      prev.state === next.state &&
      prev.attempt === next.attempt &&
      prev.retryAt === next.retryAt &&
      prev.message === next.message
    ) {
      return;
    }
    this.update({ connection: next });
  }

  private restartFlushTimer(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = setInterval(this.flush, this.snapshot.config.flushMs);
  }

  private update(partial: Partial<LiveSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial };
    this.listeners.forEach((listener) => listener());
  }
}
