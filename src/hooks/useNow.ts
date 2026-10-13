import { useCallback, useSyncExternalStore } from 'react';

const noop = () => undefined;

/**
 * Current time, re-rendering every `intervalMs` while `active`. Used only by small widgets such as countdowns.
 * The snapshot is quantized to the interval so repeated reads within one tick return the same value.
 */
export function useNow(active: boolean, intervalMs = 500): number {
  const subscribe = useCallback(
    (onTick: () => void) => {
      if (!active) return noop;
      const id = setInterval(onTick, intervalMs);
      return () => clearInterval(id);
    },
    [active, intervalMs],
  );
  return useSyncExternalStore(subscribe, () => Math.floor(Date.now() / intervalMs) * intervalMs);
}
