import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { LiveStore, type LiveSnapshot } from '../services/liveStore';
import { createWebSocketTransport, isSafeSocketUrl, Simulator } from '../services/transports';

export interface LiveStream {
  store: LiveStore;
  /** Present only when the in-process simulator is the data source. */
  simulator: Simulator | null;
}

function createLiveStream(): LiveStream {
  const url = import.meta.env.VITE_STREAM_URL as string | undefined;
  if (url && isSafeSocketUrl(url)) {
    // Auth tokens, if needed, come from an in-memory session (e.g. after login). Never from env or the URL.
    return { store: new LiveStore(createWebSocketTransport(url, () => null)), simulator: null };
  }
  const simulator = new Simulator();
  return { store: new LiveStore(simulator.createTransport), simulator };
}

/** Creates the stream once and ties the connection to the component's lifetime (StrictMode-safe). */
export function useLiveStream(): LiveStream {
  const [stream] = useState(createLiveStream);

  useEffect(() => {
    stream.store.start();
    return () => stream.store.stop();
  }, [stream]);

  return stream;
}

export const LiveStreamContext = createContext<LiveStream | null>(null);

export function useLiveStreamContext(): LiveStream {
  const stream = useContext(LiveStreamContext);
  if (!stream) throw new Error('useLiveStreamContext must be used inside LiveStreamContext');
  return stream;
}

/**
 * Subscribes to one slice of the snapshot. The component re-renders only when that slice
 * changes reference, so the connection bar doesn't re-render the chart and vice versa.
 * Selectors must return existing references (e.g. `s => s.events`), not new objects.
 */
export function useLiveSelector<T>(selector: (snapshot: LiveSnapshot) => T): T {
  const { store } = useLiveStreamContext();
  return useSyncExternalStore(store.subscribe, () => selector(store.getSnapshot()));
}
