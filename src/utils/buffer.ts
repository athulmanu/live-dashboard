/**
 * Returns a new array of at most `cap` items: the newest from `existing` followed by `incoming`.
 * Immutable so React can detect changes by reference; O(cap) per call, run once per flush, not per message.
 */
export function appendCapped<T>(existing: readonly T[], incoming: readonly T[], cap: number): T[] {
  if (cap <= 0) return [];
  if (incoming.length >= cap) return incoming.slice(incoming.length - cap);
  const keep = cap - incoming.length;
  const head = existing.length > keep ? existing.slice(existing.length - keep) : existing;
  return head.concat(incoming);
}
