import { memo } from 'react';
import type { FilterControls } from '../hooks/useFilters';
import { useLiveSelector, useLiveStreamContext } from '../hooks/useLiveStream';
import { SEVERITIES, TIME_WINDOWS, type TimeWindowId } from '../types/event';

const BUFFER_OPTIONS = [500, 2_000, 5_000, 10_000];
const FLUSH_OPTIONS = [100, 250, 500, 1_000];

type Props = FilterControls;

function FilterBarImpl({ filters, searchInput, setWindow, toggleSeverity, setSearch }: Props) {
  const { store } = useLiveStreamContext();
  const config = useLiveSelector((s) => s.config);

  return (
    <section className="filter-bar" aria-label="Filters and settings">
      <div className="filter-group filters">
        <label className="field search-field">
          <span>Search</span>
          <input
            type="search"
            placeholder="Filter by service or message…"
            maxLength={200}
            value={searchInput}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>

        <label className="field">
          <span>Time window</span>
          <select value={filters.windowId} onChange={(e) => setWindow(e.target.value as TimeWindowId)}>
            {TIME_WINDOWS.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="field">
          <legend>Severity</legend>
          <div className="chips">
            {SEVERITIES.map((s) => (
              <button
                key={s}
                type="button"
                className={`chip chip-${s}`}
                aria-pressed={filters.severities.has(s)}
                onClick={() => toggleSeverity(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="filter-group settings">
        <label className="field">
          <span>Buffer size</span>
          <select value={config.bufferSize} onChange={(e) => store.setConfig({ bufferSize: Number(e.target.value) })}>
            {BUFFER_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n.toLocaleString()} events
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>UI update every</span>
          <select value={config.flushMs} onChange={(e) => store.setConfig({ flushMs: Number(e.target.value) })}>
            {FLUSH_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} ms
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}

export const FilterBar = memo(FilterBarImpl);
