import { useVirtualizer } from '@tanstack/react-virtual';
import { memo, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import type { LiveEvent } from '../types/event';
import { formatTime, holdView, type ViewCutoff } from '../utils/helpers';

const ROW_HEIGHT = 44;
const COMPACT_ROW_HEIGHT = 62;
const SCROLL_HOLD_THRESHOLD = 8;

const EventRow = memo(function EventRow({ event }: { event: LiveEvent }) {
  // All stream text is rendered as React text nodes (auto-escaped); never as HTML, href or src.
  return (
    <div className={`event-row row-${event.severity}`}>
      <time className="time">{formatTime(event.ts)}</time>
      <span className={`sev sev-${event.severity}`}>{event.severity}</span>
      <span className="service">{event.service}</span>
      <span className="message" title={event.message}>
        {event.message}
      </span>
      <span className="latency">{event.latencyMs} ms</span>
    </div>
  );
});

/**
 * Newest first. Virtualized: only the visible rows are in the DOM, whatever the buffer size.
 * While the user hovers or scrolls down, newer events are held back so rows don't move under
 * them; the data (and KPIs/chart) keep updating, and a pill offers a jump back to live.
 */
function EventsListImpl({ events }: { events: readonly LiveEvent[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const compact = useMediaQuery('(max-width: 640px)');
  const rowHeight = compact ? COMPACT_ROW_HEIGHT : ROW_HEIGHT;
  const [cutoff, setCutoff] = useState<ViewCutoff | null>(null);
  const [hovering, setHovering] = useState(false);

  const { visible, hidden } = useMemo(() => holdView(events, cutoff), [events, cutoff]);

  // Not using React Compiler, and no virtualizer functions are passed to memoized children.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 8,
    getItemKey: (index) => visible[index]?.id ?? index,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [rowHeight, virtualizer]);

  const isScrolledAway = () => (scrollRef.current?.scrollTop ?? 0) > SCROLL_HOLD_THRESHOLD;

  const hold = () => {
    const top = events[0];
    if (top) setCutoff((prev) => prev ?? { id: top.id, ts: top.ts });
  };

  const handleScroll = () => {
    if (isScrolledAway()) hold();
    else if (!hovering) setCutoff(null);
  };

  const handlePointerEnter = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    setHovering(true);
    hold();
  };

  const handlePointerLeave = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    setHovering(false);
    if (!isScrolledAway()) setCutoff(null);
  };

  const jumpToLatest = () => {
    scrollRef.current?.scrollTo({ top: 0 });
    setHovering(false);
    setCutoff(null);
  };

  return (
    <section className="panel events-panel" aria-label="Recent events">
      <div className="panel-header">
        <div>
          <h2>Recent events</h2>
          <p className="panel-sub">
            {cutoff ? <span className="held-label">Held while you read · data still live</span> : 'Newest first'}
          </p>
        </div>
        <span className="count-pill">{visible.length.toLocaleString()}</span>
      </div>
      {events.length === 0 ? (
        <p className="empty">No events match the current filters.</p>
      ) : (
        <>
          <div className="event-row event-head" aria-hidden="true">
            <span>Time</span>
            <span>Severity</span>
            <span>Service</span>
            <span>Message</span>
            <span className="latency">Latency</span>
          </div>
          <div className="events-body" onPointerEnter={handlePointerEnter} onPointerLeave={handlePointerLeave}>
            {hidden > 0 && (
              <button type="button" className="new-events-pill" onClick={jumpToLatest}>
                ↑ {hidden.toLocaleString()} new {hidden === 1 ? 'event' : 'events'}
              </button>
            )}
            <div ref={scrollRef} className="events-scroll" onScroll={handleScroll}>
              <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
                {virtualizer.getVirtualItems().map((item) => {
                  const event = visible[item.index];
                  if (!event) return null;
                  return (
                    <div
                      key={item.key}
                      className="event-row-wrap"
                      style={{ transform: `translateY(${item.start}px)`, height: rowHeight }}
                    >
                      <EventRow event={event} />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

export const EventsList = memo(EventsListImpl);
