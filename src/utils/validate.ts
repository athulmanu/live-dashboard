import { SERVICE_STATUSES, SEVERITIES, type LiveEvent, type ServiceStatus, type Severity } from '../types/event';

export const MAX_MESSAGE_CHARS = 4_096;
export const MAX_TEXT_LENGTH = 200;
const MAX_FUTURE_SKEW_MS = 60_000;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_LATENCY_MS = 600_000;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const SERVICE_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

/** Strips control and bidi-override characters and caps length. React escapes the rest at render. */
export function sanitizeText(value: string, maxLength = MAX_TEXT_LENGTH): string {
  const cleaned = value.replace(CONTROL_CHARS, '').trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1)}…` : cleaned;
}

/**
 * Parses and validates one raw message from the stream.
 * Returns null for anything that is not a well-formed event; callers count it as rejected.
 */
export function parseEvent(raw: unknown, now: number = Date.now()): LiveEvent | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_MESSAGE_CHARS) return null;

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data)) return null;

  const { id, ts, service, severity, status, latencyMs, message } = data;

  if (typeof id !== 'string' || !ID_PATTERN.test(id)) return null;
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return null;
  if (ts > now + MAX_FUTURE_SKEW_MS || ts < now - MAX_AGE_MS) return null;
  if (typeof service !== 'string' || !SERVICE_PATTERN.test(service)) return null;
  if (!isOneOf<Severity>(SEVERITIES, severity)) return null;
  if (!isOneOf<ServiceStatus>(SERVICE_STATUSES, status)) return null;
  if (typeof latencyMs !== 'number' || !Number.isFinite(latencyMs)) return null;
  if (latencyMs < 0 || latencyMs > MAX_LATENCY_MS) return null;
  if (typeof message !== 'string') return null;

  // Build a fresh object so unknown keys (e.g. "__proto__", "html") never propagate.
  return {
    id,
    ts,
    service,
    severity,
    status,
    latencyMs: Math.round(latencyMs),
    message: sanitizeText(message),
  };
}
