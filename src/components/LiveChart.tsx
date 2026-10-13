import { memo, useMemo, useState, type PointerEvent } from 'react';
import { formatTime, type ChartPoint } from '../utils/helpers';

const WIDTH = 1000;
const HEIGHT = 300;

/** Index of the point closest to `t`. Points are sorted by time. */
function nearestIndex(points: readonly ChartPoint[], t: number): number {
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((points[mid] as ChartPoint).t < t) lo = mid + 1;
    else hi = mid;
  }
  const prev = points[lo - 1];
  return prev && t - prev.t < (points[lo] as ChartPoint).t - t ? lo - 1 : lo;
}

function niceCeil(value: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude >= value) ?? 10;
  return step * magnitude;
}

/**
 * A plain SVG line chart. One <path> for at most 300 points (one per second) is cheap to redraw
 * several times a second, avoids a charting dependency, and has no animations to queue up under load.
 * Axis labels, the hover marker and the tooltip are HTML so they don't stretch with the scaled SVG.
 */
function LiveChartImpl({ points }: { points: readonly ChartPoint[] }) {
  const [hoverT, setHoverT] = useState<number | null>(null);

  const geometry = useMemo(() => {
    if (points.length < 2) return null;
    const first = points[0] as ChartPoint;
    const last = points[points.length - 1] as ChartPoint;
    const maxY = niceCeil(Math.max(50, ...points.map((p) => p.avgLatencyMs)));
    const span = Math.max(1, last.t - first.t);
    const xPct = (t: number) => ((t - first.t) / span) * 100;
    const yPct = (v: number) => (1 - v / maxY) * 100;
    const x = (t: number) => (xPct(t) / 100) * WIDTH;
    const y = (v: number) => (yPct(v) / 100) * HEIGHT;

    const line = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.avgLatencyMs).toFixed(1)}`)
      .join('');
    const area = `${line}L${WIDTH},${HEIGHT}L0,${HEIGHT}Z`;
    const ticks = [1, 0.75, 0.5, 0.25, 0].map((f) => ({ value: Math.round(maxY * f), top: (1 - f) * 100 }));
    return { line, area, ticks, first, last, span, mid: first.t + span / 2, xPct, yPct };
  }, [points]);

  const hovered = geometry && hoverT !== null ? points[nearestIndex(points, hoverT)] : undefined;

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!geometry) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setHoverT(geometry.first.t + fraction * geometry.span);
  };

  return (
    <section className="panel chart-panel" aria-label="Average latency over time">
      <div className="panel-header">
        <div>
          <h2>Average latency</h2>
          <p className="panel-sub">Milliseconds, averaged per second · hover for details</p>
        </div>
        {geometry && (
          <div className="chart-latest">
            <span className="muted">Latest</span>
            <strong>{geometry.last.avgLatencyMs} ms</strong>
          </div>
        )}
      </div>
      {geometry ? (
        <div className="chart-body">
          <div className="chart-y-axis" aria-hidden="true">
            {geometry.ticks.map((t) => (
              <span key={t.top} style={{ top: `${t.top}%` }}>
                {t.value}
              </span>
            ))}
          </div>
          <div className="chart-plot">
            <div className="chart-canvas" onPointerMove={handlePointerMove} onPointerLeave={() => setHoverT(null)}>
              <svg
                className="chart"
                viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                preserveAspectRatio="none"
                role="img"
                aria-label={`Average latency, latest ${geometry.last.avgLatencyMs} ms`}
              >
                <defs>
                  <linearGradient id="area-fill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {geometry.ticks.map((t) => (
                  <line
                    key={t.top}
                    x1={0}
                    x2={WIDTH}
                    y1={(t.top / 100) * HEIGHT}
                    y2={(t.top / 100) * HEIGHT}
                    className="grid-line"
                  />
                ))}
                <path d={geometry.area} fill="url(#area-fill)" />
                <path d={geometry.line} className="chart-line" vectorEffect="non-scaling-stroke" />
              </svg>

              {hovered && (
                <>
                  <span className="chart-crosshair" style={{ left: `${geometry.xPct(hovered.t)}%` }} />
                  <span
                    className="chart-dot"
                    style={{ left: `${geometry.xPct(hovered.t)}%`, top: `${geometry.yPct(hovered.avgLatencyMs)}%` }}
                  />
                  <div
                    className={`chart-tooltip ${geometry.xPct(hovered.t) > 60 ? 'flip' : ''}`}
                    style={{ left: `${geometry.xPct(hovered.t)}%` }}
                    aria-hidden="true"
                  >
                    <span className="muted">{formatTime(hovered.t)}</span>
                    <strong>{hovered.avgLatencyMs} ms</strong>
                    <span className="muted">
                      {hovered.count} {hovered.count === 1 ? 'event' : 'events'}
                    </span>
                  </div>
                </>
              )}
            </div>
            <div className="chart-x-axis muted">
              <span>{formatTime(geometry.first.t)}</span>
              <span>{formatTime(geometry.mid)}</span>
              <span>{formatTime(geometry.last.t)}</span>
            </div>
          </div>
        </div>
      ) : (
        <p className="empty">Waiting for enough data to plot…</p>
      )}
    </section>
  );
}

export const LiveChart = memo(LiveChartImpl);
