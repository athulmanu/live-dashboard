import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { SEVERITIES, type Filters, type Severity, type TimeWindowId } from '../types/event';
import { MAX_TEXT_LENGTH } from '../utils/validate';

const DEFAULT_WINDOW: TimeWindowId = '5m';

export interface FilterControls {
  filters: Filters;
  /** Raw search input; `filters.search` is the deferred value used for filtering. */
  searchInput: string;
  isFiltered: boolean;
  setWindow: (id: TimeWindowId) => void;
  toggleSeverity: (severity: Severity) => void;
  setSearch: (value: string) => void;
  reset: () => void;
}

export function useFilters(): FilterControls {
  const [windowId, setWindow] = useState<TimeWindowId>(DEFAULT_WINDOW);
  const [severities, setSeverities] = useState<ReadonlySet<Severity>>(() => new Set(SEVERITIES));
  const [searchInput, setSearchInput] = useState('');
  // Typing stays responsive; filtering large buffers runs at lower priority.
  const deferredSearch = useDeferredValue(searchInput);

  const toggleSeverity = useCallback((severity: Severity) => {
    setSeverities((prev) => {
      const next = new Set(prev);
      if (next.has(severity)) next.delete(severity);
      else next.add(severity);
      return next;
    });
  }, []);

  const setSearch = useCallback((value: string) => setSearchInput(value.slice(0, MAX_TEXT_LENGTH)), []);

  const reset = useCallback(() => {
    setWindow(DEFAULT_WINDOW);
    setSeverities(new Set(SEVERITIES));
    setSearchInput('');
  }, []);

  const filters = useMemo<Filters>(
    () => ({ windowId, severities, search: deferredSearch }),
    [windowId, severities, deferredSearch],
  );

  const isFiltered = searchInput !== '' || severities.size !== SEVERITIES.length || windowId !== DEFAULT_WINDOW;

  return { filters, searchInput, isFiltered, setWindow, toggleSeverity, setSearch, reset };
}
