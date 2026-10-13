import { SERVICE_STATUSES, SEVERITIES } from '../types/event';

export interface TransportHandlers {
  onOpen: () => void;
  onMessage: (raw: unknown) => void;
  onClose: () => void;
}

/** A single connection attempt. The stream client creates a new one for every (re)connect. */
export interface Transport {
  open: (handlers: TransportHandlers) => void;
  close: () => void;
}

export type TransportFactory = () => Transport;

// ---------------------------------------------------------------------------
// WebSocket transport
// ---------------------------------------------------------------------------

export function isSafeSocketUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'ws:' || protocol === 'wss:';
  } catch {
    return false;
  }
}

/**
 * `getToken` is read at connect time and sent as the first frame, never in the URL
 * (URLs end up in proxy logs, browser history and Referer headers).
 */
export function createWebSocketTransport(url: string, getToken?: () => string | null): TransportFactory {
  if (!isSafeSocketUrl(url)) throw new Error('Invalid stream URL');

  return () => {
    let socket: WebSocket | null = null;
    return {
      open(handlers) {
        socket = new WebSocket(url);
        socket.onopen = () => {
          const token = getToken?.();
          if (token) socket?.send(JSON.stringify({ type: 'auth', token }));
          handlers.onOpen();
        };
        socket.onmessage = (event: MessageEvent) => handlers.onMessage(event.data);
        socket.onclose = () => handlers.onClose();
        // onerror is always followed by onclose; the event carries nothing safe to show.
        socket.onerror = () => undefined;
      },
      close() {
        if (!socket) return;
        socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
        socket.close();
        socket = null;
      },
    };
  };
}

// ---------------------------------------------------------------------------
// Simulated transport with fault injection
// ---------------------------------------------------------------------------

const SERVICES = ['api-gateway', 'auth', 'billing', 'search', 'payments', 'notifications'];
const MESSAGES = [
  'Request completed',
  'Cache miss, fetched from origin',
  'Upstream responded slowly',
  'Retrying request',
  'Health check passed',
  'Connection pool saturated',
  'Rate limit applied',
];
const HOSTILE_PAYLOADS: string[] = [
  'not json at all',
  '{"id":"x1","ts":"yesterday"}',
  '{"id":"<b>","ts":0,"service":"auth","severity":"info","status":"ok","latencyMs":1,"message":"x"}',
  JSON.stringify({ id: 'big', message: 'A'.repeat(10_000) }),
  '[1,2,3]',
  'null',
  '{"__proto__":{"polluted":true}}',
];
const XSS_MESSAGE = '<img src=x onerror="alert(1)"> <script>alert("xss")</script>';

const TICK_MS = 50;
/** Background tabs throttle timers to ~1/s; emit by elapsed time, but never replay more than this. */
const MAX_CATCH_UP_MS = 2_000;

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)] as T;
}

let sequence = 0;

function generateEvent(now: number, hostile: boolean): string {
  sequence += 1;
  const roll = Math.random();
  const severity = roll > 0.97 ? SEVERITIES[2] : roll > 0.85 ? SEVERITIES[1] : SEVERITIES[0];
  const status =
    severity === 'critical' ? SERVICE_STATUSES[2] : severity === 'warning' ? SERVICE_STATUSES[1] : SERVICE_STATUSES[0];
  const base = 40 + 30 * Math.sin(now / 8000);
  const latencyMs = Math.max(
    1,
    base + Math.random() * 40 + (severity === 'critical' ? 400 : severity === 'warning' ? 120 : 0),
  );
  return JSON.stringify({
    id: `evt-${now.toString(36)}-${sequence}`,
    ts: now,
    service: pick(SERVICES),
    severity,
    status,
    latencyMs,
    message: hostile && Math.random() < 0.3 ? XSS_MESSAGE : pick(MESSAGES),
  });
}

export interface SimulatorOptions {
  ratePerSec: number;
}

/**
 * Generates events in-process. It shares the transport interface with the WebSocket transport, so
 * the client, store and UI can't tell them apart. Fault controls exist to demonstrate resilience.
 */
export class Simulator {
  private active: { drop: () => void } | null = null;
  private failuresRemaining = 0;
  private burstUntil = 0;
  private hostile = false;

  constructor(private readonly options: SimulatorOptions = { ratePerSec: 20 }) {}

  readonly createTransport: TransportFactory = () => {
    let interval: ReturnType<typeof setInterval> | null = null;
    let connectTimer: ReturnType<typeof setTimeout> | null = null;
    let carry = 0;

    const stop = () => {
      if (interval) clearInterval(interval);
      if (connectTimer) clearTimeout(connectTimer);
      interval = connectTimer = null;
    };

    return {
      open: (handlers) => {
        connectTimer = setTimeout(
          () => {
            if (this.failuresRemaining > 0) {
              this.failuresRemaining -= 1;
              stop();
              handlers.onClose();
              return;
            }
            handlers.onOpen();
            const handle = {
              drop: () => {
                stop();
                this.active = null;
                handlers.onClose();
              },
            };
            this.active = handle;

            let lastTick = Date.now();
            interval = setInterval(() => {
              const now = Date.now();
              const elapsed = Math.min(now - lastTick, MAX_CATCH_UP_MS);
              lastTick = now;
              const rate = now < this.burstUntil ? 2_000 : this.options.ratePerSec;
              carry += (rate * elapsed) / 1000;
              const count = Math.floor(carry);
              carry -= count;
              for (let i = 0; i < count; i += 1) {
                const malformed = this.hostile && Math.random() < 0.15;
                handlers.onMessage(malformed ? pick(HOSTILE_PAYLOADS) : generateEvent(now, this.hostile));
              }
            }, TICK_MS);
          },
          300 + Math.random() * 500,
        );
      },
      close: () => {
        stop();
        this.active = null;
      },
    };
  };

  /** Floods the client at ~2,000 msg/s to exercise batching and backpressure. */
  burst(durationMs = 5_000): void {
    this.burstUntil = Date.now() + durationMs;
  }

  setHostile(enabled: boolean): void {
    this.hostile = enabled;
  }

  dropConnection(): void {
    this.active?.drop();
  }

  /** Makes the next `count` connection attempts fail, to show backoff and the error state. */
  failNextConnections(count: number): void {
    this.failuresRemaining = count;
    this.active?.drop();
  }

  /** Clears all injected faults. */
  restore(): void {
    this.failuresRemaining = 0;
    this.burstUntil = 0;
  }
}
