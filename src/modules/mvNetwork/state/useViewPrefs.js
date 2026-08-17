import { useCallback, useEffect, useState } from 'react';

const KEY = 'daybook.mvNetwork.viewPrefs';

const DEFAULTS = {
  cables: true,
  labels: false,
  labelMode: 'persistent', // 'persistent' shows at high zoom / when toggled on; 'select' shows only the selected node
  openPoints: true,
  earthing: true,
  markerStyle: '3d', // '3d' | 'flat' | 'symbol'
  sizeScale: 1,
  lineScale: 1,
  baseMap: 'jawgterrain',
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

/** Map display/style prefs — device-local only, deliberately not part of the
 *  network document (so they never round-trip through JSON export or cloud
 *  backup, same reasoning as keeping trip/recovery state local-only). */
export function useViewPrefs() {
  const [prefs, setPrefs] = useState(load);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  }, [prefs]);

  const setPref = useCallback((key, value) => {
    setPrefs((cur) => ({ ...cur, [key]: value }));
  }, []);

  return { prefs, setPref };
}
