import { memo } from 'react';
import type { Kpis } from '../utils/helpers';

type Tone = 'accent' | 'ok' | 'warn' | 'danger';

interface KpiCardProps {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
  /** 0–1; renders a proportion bar. */
  share?: number;
}

const KpiCard = memo(function KpiCard({ label, value, hint, tone = 'accent', share }: KpiCardProps) {
  return (
    <article className={`kpi-card tone-${tone}`}>
      <h3>{label}</h3>
      <p className="kpi-value">{value}</p>
      {share !== undefined && (
        <div className="kpi-bar" aria-hidden="true">
          <span style={{ width: `${Math.round(share * 100)}%` }} />
        </div>
      )}
      {hint && <p className="kpi-hint">{hint}</p>}
    </article>
  );
});

const percent = (part: number, total: number) => (total ? `${Math.round((part / total) * 100)}%` : '0%');

function KpiCardsImpl({ kpis, bufferLimited }: { kpis: Kpis; bufferLimited: boolean }) {
  const { byStatus, bySeverity, total } = kpis;
  const share = (n: number) => (total ? n / total : 0);

  return (
    <section className="kpi-grid" aria-label="Key metrics">
      <KpiCard
        label="Events in window"
        value={total.toLocaleString()}
        hint={bufferLimited ? 'Limited by buffer size' : 'Matching current filters'}
      />
      <KpiCard label="Throughput" value={`${kpis.ratePerSec}/s`} hint="Last 10 seconds" />
      <KpiCard label="Avg latency" value={`${kpis.avgLatencyMs} ms`} hint={`p95 ${kpis.p95LatencyMs} ms`} />
      <KpiCard
        label="Healthy"
        value={byStatus.ok.toLocaleString()}
        hint={`${percent(byStatus.ok, total)} of events`}
        tone="ok"
        share={share(byStatus.ok)}
      />
      <KpiCard
        label="Degraded"
        value={byStatus.degraded.toLocaleString()}
        hint={`${bySeverity.warning.toLocaleString()} warnings`}
        tone="warn"
        share={share(byStatus.degraded)}
      />
      <KpiCard
        label="Down"
        value={byStatus.down.toLocaleString()}
        hint={`${bySeverity.critical.toLocaleString()} critical`}
        tone="danger"
        share={share(byStatus.down)}
      />
    </section>
  );
}

export const KpiCards = memo(KpiCardsImpl);
