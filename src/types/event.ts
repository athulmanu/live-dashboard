export const SEVERITIES = ['info', 'warning', 'critical'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const SERVICE_STATUSES = ['ok', 'degraded', 'down'] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

/** A validated event. Only values of this type may reach the UI. */
export interface LiveEvent {
  id: string;
  ts: number;
  service: string;
  severity: Severity;
  status: ServiceStatus;
  latencyMs: number;
  message: string;
}

/** Transport-level state, owned by the stream client. */
export type TransportState = 'connecting' | 'live' | 'reconnecting' | 'error' | 'idle';

/** What the UI shows: transport state plus the user-controlled paused state. */
export type ConnectionState = 'connecting' | 'live' | 'paused' | 'reconnecting' | 'error';

export interface ConnectionInfo {
  state: ConnectionState;
  attempt: number;
  retryAt: number | null;
  /** User-safe message only; never raw error details. */
  message: string | null;
}

export interface StreamStats {
  received: number;
  rejected: number;
  dropped: number;
}

export const TIME_WINDOWS = [
  { id: '1m', label: 'Last 1 min', ms: 60_000 },
  { id: '5m', label: 'Last 5 min', ms: 300_000 },
  { id: '15m', label: 'Last 15 min', ms: 900_000 },
  { id: 'all', label: 'Whole buffer', ms: Number.POSITIVE_INFINITY },
] as const;
export type TimeWindowId = (typeof TIME_WINDOWS)[number]['id'];

export interface Filters {
  windowId: TimeWindowId;
  severities: ReadonlySet<Severity>;
  search: string;
}
