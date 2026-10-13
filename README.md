# Live Monitoring Dashboard

A real-time monitoring dashboard built with React 18, TypeScript and Vite. It stays smooth under high-frequency updates and treats every streamed message as untrusted.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest unit tests
npm run lint       # ESLint (includes security rules)
npm run format     # Prettier
npm run check      # type-check + lint + format check + tests
npm run build      # type-check + production build
```

Requires Node 20.19+ or 22.13+ (needed by ESLint 10; the app itself runs on Node 18+).

### Configuration

| Variable          | Default | Description                                                                      |
| ----------------- | ------- | -------------------------------------------------------------------------------- |
| `VITE_STREAM_URL` | unset   | A `ws://` or `wss://` endpoint. When unset, the built-in simulated feed is used. |

Copy `.env.example` to `.env.local` to set it. Never put secrets in `VITE_*` variables: Vite bundles them into the client.

The WebSocket endpoint should send one JSON object per frame:

```json
{
  "id": "evt-123",
  "ts": 1700000000000,
  "service": "auth",
  "severity": "info",
  "status": "ok",
  "latencyMs": 42,
  "message": "Request completed"
}
```

## Features

- **Connection bar**: shows connecting, live, paused, reconnecting and error states, the retry countdown, accepted/rejected/dropped counters, Pause/Resume and "Retry now".
- **Filters**: time window (1/5/15 min or the whole buffer), severity toggles, and text search.
- **Settings**: buffer size (500 to 10,000 events) and UI update interval (100 to 1,000 ms), both changeable at runtime.
- **KPIs**: events in window, rate per second, average and p95 latency, healthy/degraded/down counts.
- **Live chart**: average latency per second (plain SVG), with a hover tooltip.
- **Events list**: newest first, virtualized, and held still while the user is reading it.
- **States**: skeleton loading, a stale-data banner when disconnected, empty states with a "Reset filters" action, and per-panel error fallbacks.
- **Stress-test panel** (simulated feed only): a 2,000 msg/s burst, dropping the connection, flapping, killing and restoring the feed, and hostile data (malformed JSON, schema violations, oversized messages, XSS payloads, prototype-pollution attempts).

## Architecture

```
src/
├── types/event.ts            domain types and constants
├── utils/
│   ├── validate.ts           runtime validation and sanitization of untrusted messages
│   ├── backoff.ts            exponential backoff with full jitter
│   ├── buffer.ts             immutable capped append
│   └── helpers.ts            pure derivations: filter, KPIs, per-second buckets
├── services/
│   ├── transports.ts         Transport interface; WebSocket and Simulator implementations
│   ├── streamClient.ts       connection state machine, validation, reconnection (no React)
│   └── liveStore.ts          external store: queue, batched flush, backpressure, pause
├── hooks/
│   ├── useLiveStream.ts      creates the stream, owns its lifecycle; useLiveSelector
│   ├── useFilters.ts         filter state (search value is deferred)
│   ├── useMediaQuery.ts      responsive switches (e.g. compact list rows)
│   └── useNow.ts             ticking clock for countdowns and "Xs ago" labels only
├── components/               presentational, memoized widgets
├── App.tsx
└── main.tsx
```

Data flows one way:

```
Transport → StreamClient (validate, reconnect) → LiveStore (queue, batch, cap)
         → useSyncExternalStore selectors → Dashboard (useMemo derivations) → memoized widgets
```

The UI never touches the socket. The client and store are plain TypeScript classes, unit-tested without React. The simulator and the WebSocket implement the same `Transport` interface, so nothing above that layer knows which one is in use.

## Performance decisions

1. **Batched updates.** Incoming messages are pushed onto a mutable queue (O(1), no React work). A timer flushes the queue every `flushMs` (250 ms by default) and publishes one new immutable snapshot. At 2,000 msg/s that is still about 4 renders per second, not 2,000.
2. **Bounded memory.**
   - The event buffer is capped at `bufferSize`.
   - The pending queue is also capped. It only grows during bursts, while paused, or in a background tab; overflow drops the oldest messages and is counted as "Dropped".
   - The chart is bucketed per second and capped at 300 points.
3. **Isolated re-renders.**
   - Each component subscribes through `useSyncExternalStore` with a selector, so it re-renders only when its slice changes reference. The retry countdown and stats counters re-render the connection bar only, not the chart or list.
   - Widgets are wrapped in `React.memo`.
   - Derived data (filtered events, KPIs, chart points) is computed with `useMemo` and never duplicated into state.
4. **Virtualized list** (`@tanstack/react-virtual`). Only about 20 rows are in the DOM whatever the buffer size, with stable keys from event IDs.
5. **Lightweight chart.** A single SVG `<path>` with no animations. A charting library adds bundle weight and per-update animation work that queues up under load, and is unnecessary for one series.
6. **Deferred search.** `useDeferredValue` keeps typing responsive while large buffers are filtered.

**Measured** (simulated burst at 2,000 msg/s for 5 s, `flushMs` 250, buffer 2,000): about 8,800 messages processed in 6 s, the UI stayed responsive, the buffer held at exactly 2,000 events, 18 list rows were in the DOM, and the console showed no errors or warnings. A unit test (`liveStore.test.ts`) asserts that a burst of 500 messages produces exactly one store update per flush. To see re-render isolation in the browser, enable "Highlight updates when components render" in React DevTools settings.

## Security decisions

1. **Untrusted input, validated at runtime** (`utils/validate.ts`). TypeScript types disappear at runtime, so every message is checked:
   - its size is capped _before_ `JSON.parse`;
   - it must be a JSON object;
   - `id` and `service` must match allow-list patterns;
   - `severity` and `status` must be known enum values;
   - numbers must be finite and in range;
   - timestamps must be within a sane skew;
   - strings are stripped of control and bidi-override characters and length-capped.

   A fresh object is built from known fields only, so unknown keys and `__proto__` never pass through. Invalid messages are dropped and counted, never logged.

2. **XSS-safe rendering.** No `dangerouslySetInnerHTML`, and stream data never goes into `href`, `src` or `style`. All text renders as React text nodes, which React escapes. The "Hostile data" mode injects `<img onerror>` and `<script>` payloads; they appear as literal text.
3. **No secrets in the client.** No keys or tokens are hard-coded or put in env vars. The WebSocket transport takes a `getToken` callback (currently returning `null`, as the demo feed needs no auth): the token is read from memory at connect time and sent as the first frame, never in the URL (which would leak into logs, history and Referer headers). The URL must be `ws:` or `wss:`.
4. **Controlled reconnection.**
   - Exponential backoff with full jitter, capped at 15 s, and at most 8 attempts before an explicit error state with a manual retry.
   - The backoff resets only after the connection has stayed up for 5 s, so a flapping server can't cause a reconnect storm.
   - Callbacks from stale connections are ignored, using a generation counter.
5. **No leaked details.** There are no `console.*` calls. Error messages are fixed, user-safe strings; the raw socket error is never shown.
6. **Flood resistance.** Capped queues and buffers plus batched rendering mean a flood of data degrades to dropping old messages, not to freezing the tab.

For production, also serve a strict Content-Security-Policy header (`default-src 'self'; connect-src 'self' wss://your-host`). It is not set as a `<meta>` tag here because Vite's dev server injects inline scripts for hot reload.

## Behaviour notes

- **Pause** freezes the view, not the connection. Events keep arriving into a capped queue (shown as "N queued"), and Resume applies them in one batch. Time windows are calculated against the time of the last applied update, so filtering while paused gives stable, correct results.
- **Stale data is never shown as live.** If the connection drops after data has arrived, a banner shows the time of the last update and how long ago it was, and the data panels dim. Time windows stop advancing while disconnected, so the numbers stay consistent with "data as of" that time.
- **Reading the events list.** While the mouse is over the list or the user has scrolled down, newer events are held back so rows don't move while being read. Data, KPIs and the chart stay live, filters still apply, and a "↑ N new events" button jumps back to live. This is separate from Pause, which freezes the whole dashboard.
- **Reconnect gaps.** Events missed while disconnected are not replayed. A real backend could support resuming from the last event ID.
- **React StrictMode** is on. The stream connects in `useEffect` and disconnects in cleanup, so the dev-mode double mount never leaves two connections open.
- **Error boundaries.** Each data panel (KPIs, chart, events) has its own boundary, so a render error replaces only that panel with a "Try again" card and the stream keeps running. An app-level boundary catches anything else. Fallbacks never show error messages or stacks.
- **Linting as a guardrail.** Besides the TypeScript and React Hooks rules, ESLint reports an error (failing `npm run lint` and `npm run check`) on `dangerouslySetInnerHTML`, `innerHTML`, `eval`/`new Function`, and any `console.*` call, so the security rules above are enforced, not just documented.

## Libraries

| Library                   | Why                                                      |
| ------------------------- | -------------------------------------------------------- |
| `@tanstack/react-virtual` | Headless, small, well-maintained list virtualization.    |
| `vitest`                  | Fast unit tests that share Vite's config.                |
| `react-error-boundary`    | Error boundaries without writing a class component.      |
| `eslint`, `prettier`      | Linting (with security rules) and consistent formatting. |

There is deliberately no state library (React's own `useSyncExternalStore` covers it), no chart library (one SVG path is enough), and no schema library (hand-written type guards are small, dependency-free and easy to audit).
