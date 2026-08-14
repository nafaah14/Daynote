import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

/**
 * The derived AES key lives here ONLY — in memory, for the lifetime of this
 * provider. Never written to localStorage/sessionStorage/IndexedDB. Unmounting
 * (leaving the Personal Info screen) or backgrounding the tab past the
 * threshold below both clear it; re-entering always starts locked.
 */
const LOCK_AFTER_MS = 2 * 60 * 1000;

const Ctx = createContext(null);

export function PersonalInfoSessionProvider({ children }) {
  const [key, setKey] = useState(null);
  const hiddenAt = useRef(null);

  const lock = useCallback(() => setKey(null), []);
  const unlockWithKey = useCallback((k) => setKey(k), []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now();
        return;
      }
      if (hiddenAt.current == null) return;
      const elapsed = Date.now() - hiddenAt.current;
      hiddenAt.current = null;
      if (elapsed > LOCK_AFTER_MS) lock();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [lock]);

  return <Ctx.Provider value={{ key, isUnlocked: !!key, unlockWithKey, lock }}>{children}</Ctx.Provider>;
}

export function usePersonalInfoSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePersonalInfoSession must be used inside PersonalInfoSessionProvider');
  return ctx;
}
