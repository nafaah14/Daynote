import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_BASE_LAYER } from '../../../core/map/baseLayers';

const KEY = 'daybook.regions.prefs';

const DEFAULTS = {
  baseMap: DEFAULT_BASE_LAYER,
  shown: { W: true, S: true, D: true, Y: true },
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const saved = JSON.parse(raw);
    return { ...DEFAULTS, ...saved, shown: { ...DEFAULTS.shown, ...(saved.shown || {}) } };
  } catch {
    return DEFAULTS;
  }
}

/**
 * Which basemap, and which regions are ticked — device-local, like MV
 * Network's view prefs. It's how you left the screen looking, not data about
 * the organisation, so it has no business in the repo or in cloud backup.
 */
export function useRegionsPrefs() {
  const [prefs, setPrefs] = useState(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch { /* private mode / quota — the screen still works, it just forgets */ }
  }, [prefs]);

  const setPref = useCallback((key, value) => setPrefs((cur) => ({ ...cur, [key]: value })), []);

  const toggleRegion = useCallback((k) => setPrefs((cur) => ({
    ...cur, shown: { ...cur.shown, [k]: !cur.shown[k] },
  })), []);

  /** Tapping a place in a region you've unticked should show it, not nothing. */
  const ensureShown = useCallback((k) => setPrefs((cur) => (
    !k || cur.shown[k] ? cur : { ...cur, shown: { ...cur.shown, [k]: true } }
  )), []);

  return { prefs, setPref, toggleRegion, ensureShown };
}
