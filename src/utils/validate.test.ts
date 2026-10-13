import { describe, expect, it } from 'vitest';
import { MAX_MESSAGE_CHARS, parseEvent, sanitizeText } from './validate';

const NOW = 1_700_000_000_000;
const valid = {
  id: 'evt-1',
  ts: NOW,
  service: 'auth',
  severity: 'info',
  status: 'ok',
  latencyMs: 42.4,
  message: 'Request completed',
};
const raw = (overrides: Record<string, unknown> = {}) => JSON.stringify({ ...valid, ...overrides });

describe('parseEvent', () => {
  it('accepts a well-formed event and normalizes it', () => {
    expect(parseEvent(raw(), NOW)).toEqual({ ...valid, latencyMs: 42 });
  });

  it.each([
    ['non-string input', 42],
    ['invalid JSON', '{not json'],
    ['JSON array', '[1,2]'],
    ['JSON null', 'null'],
    ['oversized message', raw({ message: 'a'.repeat(MAX_MESSAGE_CHARS) })],
    ['unknown severity', raw({ severity: 'panic' })],
    ['unknown status', raw({ status: 'exploded' })],
    ['NaN-like latency', raw({ latencyMs: 'NaN' })],
    ['negative latency', raw({ latencyMs: -1 })],
    ['string timestamp', raw({ ts: '2024-01-01' })],
    ['far-future timestamp', raw({ ts: NOW + 3_600_000 })],
    ['ancient timestamp', raw({ ts: 0 })],
    ['HTML in id', raw({ id: '<script>' })],
    ['uppercase/space in service', raw({ service: 'Auth Service' })],
    ['missing message', raw({ message: undefined })],
  ])('rejects %s', (_label, input) => {
    expect(parseEvent(input, NOW)).toBeNull();
  });

  it('keeps HTML in messages as inert text and drops unknown keys', () => {
    const event = parseEvent(raw({ message: '<img src=x onerror=alert(1)>', html: '<b>x</b>' }), NOW);
    expect(event?.message).toBe('<img src=x onerror=alert(1)>');
    expect(event).not.toHaveProperty('html');
  });

  it('does not allow prototype pollution', () => {
    parseEvent('{"__proto__":{"polluted":true}}', NOW);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('sanitizeText', () => {
  it('strips control and bidi-override characters', () => {
    expect(sanitizeText('ok\u0000\u202Eevil\n')).toBe('okevil');
  });

  it('truncates long text', () => {
    expect(sanitizeText('a'.repeat(500), 10)).toHaveLength(10);
  });
});
