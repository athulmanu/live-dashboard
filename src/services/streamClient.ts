import type { LiveEvent, TransportState } from '../types/event';
import { backoffDelay, DEFAULT_BACKOFF, type BackoffOptions } from '../utils/backoff';
import { parseEvent } from '../utils/validate';
import type { Transport, TransportFactory } from './transports';

export interface TransportStatus {
  state: TransportState;
  attempt: number;
  retryAt: number | null;
  message: string | null;
}

export interface StreamSink {
  onEvent: (event: LiveEvent) => void;
  onRejected: () => void;
  onStatus: (status: TransportStatus) => void;
}

export interface StreamClientOptions {
  backoff: BackoffOptions;
  maxAttempts: number;
  /** A connection must stay up this long before the backoff resets, so a flapping link keeps backing off. */
  stableAfterMs: number;
}

const DEFAULT_OPTIONS: StreamClientOptions = {
  backoff: DEFAULT_BACKOFF,
  maxAttempts: 8,
  stableAfterMs: 5_000,
};

/**
 * Owns the connection lifecycle: connect, validate every message, reconnect with backoff.
 * Contains no React and no rendering.
 */
export class StreamClient {
  private transport: Transport | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private stableTimer: ReturnType<typeof setTimeout> | null = null;
  /** Incremented on every connection attempt so callbacks from stale transports are ignored. */
  private generation = 0;
  private attempt = 0;
  private state: TransportState = 'idle';
  private readonly options: StreamClientOptions;

  constructor(
    private readonly createTransport: TransportFactory,
    private readonly sink: StreamSink,
    options: Partial<StreamClientOptions> = {},
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  connect(): void {
    if (this.state !== 'idle' && this.state !== 'error') return;
    this.attempt = 0;
    this.open('connecting');
  }

  disconnect(): void {
    this.generation += 1;
    this.clearTimers();
    this.transport?.close();
    this.transport = null;
    this.setStatus('idle', null, null);
  }

  /** Manual retry from the error state, or skipping a pending backoff wait. */
  retryNow(): void {
    this.disconnect();
    this.connect();
  }

  private open(state: 'connecting' | 'reconnecting'): void {
    const generation = ++this.generation;
    const isCurrent = () => generation === this.generation;
    this.setStatus(state, null, state === 'reconnecting' ? 'Reconnecting to the live feed…' : null);

    const transport = this.createTransport();
    this.transport = transport;
    transport.open({
      onOpen: () => {
        if (!isCurrent()) return;
        this.setStatus('live', null, null);
        this.stableTimer = setTimeout(() => {
          this.attempt = 0;
        }, this.options.stableAfterMs);
      },
      onMessage: (raw) => {
        if (!isCurrent()) return;
        const event = parseEvent(raw);
        if (event) this.sink.onEvent(event);
        else this.sink.onRejected();
      },
      onClose: () => {
        if (!isCurrent()) return;
        this.transport = null;
        this.scheduleReconnect();
      },
    });
  }

  private scheduleReconnect(): void {
    this.clearTimers();
    if (this.attempt >= this.options.maxAttempts) {
      this.generation += 1;
      this.setStatus('error', null, 'Unable to reach the live feed. Check your connection and retry.');
      return;
    }
    const delay = backoffDelay(this.attempt, this.options.backoff);
    this.attempt += 1;
    const retryAt = Date.now() + delay;
    this.setStatus('reconnecting', retryAt, 'Connection lost. Reconnecting…');
    this.retryTimer = setTimeout(() => this.open('reconnecting'), delay);
  }

  private clearTimers(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.stableTimer) clearTimeout(this.stableTimer);
    this.retryTimer = this.stableTimer = null;
  }

  private setStatus(state: TransportState, retryAt: number | null, message: string | null): void {
    this.state = state;
    this.sink.onStatus({ state, attempt: this.attempt, retryAt, message });
  }
}
