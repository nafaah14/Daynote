import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';

/**
 * App configuration. Deliberately NOT records.
 *
 * Theme, the bottom bar, notification preferences — these are how you want
 * the app arranged, not things you track. Keeping them out of the record
 * envelope is what stops "settings" from polluting your data.
 *
 * localStorage now; a single Firestore doc later. Same seam as the repo.
 */
const KEY = 'daybook.settings.v1';

export const DEFAULTS = {
  theme: 'light',                 // light | dark | paper | system
  nav: null,                      // ordered [moduleId] for the bottom bar; null = sensible default
  navSize: 6,                     // 4 or 6 — total bar slots, always split evenly around the assistant
  notifications: {
    enabled: false,               // subscribed on this device
    prefs: {},                    // { [categoryId]: boolean }
  },
};

/**
 * A stored value is never trusted just because it parsed as JSON. `nav`
 * specifically gets consumed with .map/.includes/.filter in three different
 * places (Settings, AppShell, the launcher) — if it's ever anything but an
 * array of strings, each of those throws with nothing to catch it. Validating
 * once here, at the boundary where outside data enters the app, closes the
 * whole class rather than defending it at every call site.
 */
const isValidNav = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');
const dedupeNav = (v) => [...new Set(v)];
const isValidNavSize = (v) => v === 4 || v === 6;

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      ...DEFAULTS, ...saved,
      nav: isValidNav(saved.nav) ? dedupeNav(saved.nav) : null,
      navSize: isValidNavSize(saved.navSize) ? saved.navSize : DEFAULTS.navSize,
      notifications: { ...DEFAULTS.notifications, ...(saved.notifications || {}) },
    };
  } catch { return { ...DEFAULTS }; }
}

const SettingsCtx = createContext(null);

/** Resolve 'system' to an actual theme, following OS changes live. */
function useResolvedTheme(theme) {
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = (e) => setSystemDark(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(load);
  const resolvedTheme = useResolvedTheme(settings.theme);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
  }, [resolvedTheme]);

  const api = useMemo(() => ({
    ...settings,
    resolvedTheme,

    set(patch) { setSettings((s) => ({ ...s, ...patch })); },

    setTheme(theme) { setSettings((s) => ({ ...s, theme })); },

    // Same guard on the way OUT, so nothing written by the app itself can
    // ever reintroduce the bad shape this file just protected against on load.
    setNav(ids) { setSettings((s) => ({ ...s, nav: isValidNav(ids) ? dedupeNav(ids) : null })); },

    /**
     * 4 or 6 only — always an even split around the assistant button. Shrinking
     * trims any excess from the current nav list immediately, so the bar can
     * never end up with more chosen modules than slots to hold them.
     */
    setNavSize(n) {
      if (!isValidNavSize(n)) return;
      setSettings((s) => ({
        ...s, navSize: n,
        nav: Array.isArray(s.nav) ? s.nav.slice(0, n) : s.nav,
      }));
    },

    setNotifications(patch) {
      setSettings((s) => ({ ...s, notifications: { ...s.notifications, ...patch } }));
    },

    toggleNotifyPref(id, on) {
      setSettings((s) => ({
        ...s,
        notifications: { ...s.notifications, prefs: { ...s.notifications.prefs, [id]: on } },
      }));
    },

    // helper with a sensible default (missing key = shown)
    notifyEnabled: (id) => settings.notifications.prefs[id] !== false,
  }), [settings, resolvedTheme]);

  return <SettingsCtx.Provider value={api}>{children}</SettingsCtx.Provider>;
}

export const useSettings = () => {
  const ctx = useContext(SettingsCtx);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
};
