import { useState, useEffect, useRef, useCallback, Fragment } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Search, LayoutGrid, Settings as Cog, CloudOff, RefreshCw, X, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { dueLabel } from '../dates';
import { useRepo } from '../db/repo';
import { useSettings } from '../settings/settings';
import { integrated, hostedApps, modules, defaultNav } from '../../registry';
import { EmptyState } from '../ui/components';
import { NotifyBell, NotifyPanel } from '../notify/NotifyPanel';
import { useSwipeNav } from './useSwipeNav';
import { collectEvents, pruneEvents } from '../notify/notify';
import './shell.css';

/* -------------------------------- search ------------------------------- */

function SearchOverlay({ open, onClose }) {
  const repo = useRepo();
  const nav = useNavigate();
  const [q, setQ] = useState('');

  const term = q.trim().toLowerCase();
  const results = term.length < 2
    ? []
    : integrated.flatMap((m) => (m.search ? m.search({ repo }, term) : [])).slice(0, 25);

  const go = (to) => { onClose(); setQ(''); nav(to); };

  if (!open) return null;

  /**
   * Anchored to the TOP of the screen, not the bottom.
   *
   * As a bottom sheet the input sat just above the keyboard and the results
   * rendered underneath it — you had to dismiss the keyboard to read your own
   * search. Pinning the field to the top means results fill the space between
   * it and the keyboard, staying visible while you type.
   */
  return (
    <div className="search-overlay" role="dialog" aria-modal="true" aria-label="Search">
      <div className="search-bar">
        <Search size={17} style={{ color: 'var(--muted)', flex: 'none' }} />
        <input
          className="search-input"
          placeholder="Search everything"
          value={q}
          autoFocus
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search everything"
        />
        <button className="icon-btn" onClick={() => { setQ(''); onClose(); }} aria-label="Close search">
          <X size={18} />
        </button>
      </div>
      <div className="search-scroll">
        {term.length >= 2 && results.length === 0 && (
          <EmptyState title="No matches" body="Try a shorter word." />
        )}
        {term.length < 2 && (
          <p className="search-hint">Type at least two letters.</p>
        )}
        {results.map((r) => (
          <button key={r.id} className="search-hit" onClick={() => go(r.to)}>
            <span>{r.title}</span>
            <span className="eyebrow">{r.sub}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------- launcher ------------------------------ */

/**
 * The Everything menu — a right-edge drawer (like a phone's Edge panel), not
 * a <Sheet> and not a bottom sheet.
 *
 * Not a <Sheet>: a Sheet pushes a history entry and pops it with
 * history.back() on close — right for a form you might dismiss with the back
 * button, but for a launcher it races the navigation: tapping a tile closes
 * the sheet (→ history.back()) and navigates at the same time, and depending
 * on which resolves first the back() sometimes undoes the navigation. That's
 * why tiles opened only *sometimes*. A launcher has nothing to "go back"
 * from, so it skips history entirely and just navigates — a plain list of
 * links to other screens never had this problem in the first place. Escape
 * and tapping the backdrop close it.
 *
 * Not a bottom sheet: it used to be a full-width bottom sheet plus a fixed
 * "More" tab in the bar, which cost a whole tab slot for something used
 * rarely. Now it's a single handle+panel assembly that lives at the right
 * edge always, peeking out as just the handle when closed and sliding fully
 * into view on tap. Deliberately capped in height rather than full-screen,
 * so it stays reachable with one thumb instead of demanding a second hand.
 */
function Launcher({ open, onOpen, onClose }) {
  const nav = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Without this, scrolling the grid to its end chains into scrolling the
  // page underneath — the drawer floats over content rather than covering
  // it, so there's nothing else stopping that.
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const go = (to) => { onClose(); nav(to); };

  return (
    <>
      {open && <div className="side-drawer-catcher" onMouseDown={onClose} />}
      <div className={`side-drawer-wrap ${open ? 'is-open' : ''}`}>
        <div className="side-drawer-panel" role="dialog" aria-modal={open} aria-label="Everything" aria-hidden={!open}>
          <div className="side-drawer-grid">
            {[...integrated, ...hostedApps].map((m) => (
              <button key={m.id} className="side-drawer-tile" onClick={() => go(m.routes[0].path)} tabIndex={open ? 0 : -1}>
                <m.icon size={18} strokeWidth={1.7} style={{ color: m.accent || 'var(--muted)' }} />
                <span>{m.title}</span>
              </button>
            ))}
            <button className="side-drawer-tile" onClick={() => go('/settings')} tabIndex={open ? 0 : -1}>
              <Cog size={18} strokeWidth={1.7} style={{ color: 'var(--muted)' }} />
              <span>Settings</span>
            </button>
          </div>
        </div>
        <button
          type="button"
          className="side-drawer-handle"
          onClick={() => (open ? onClose() : onOpen())}
          aria-label={open ? 'Close module drawer' : 'Open module drawer'}
          aria-expanded={open}
        >
          {open ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>
    </>
  );
}

/* --------------------------------- shell ------------------------------- */

export default function AppShell({ children }) {
  const [searching, setSearching] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const settings = useSettings();
  const repo = useRepo();
  const nav = useNavigate();

  /**
   * Ask every module what's worth notifying about — on open, and periodically
   * while the app stays open.
   *
   * The repo object is rebuilt whenever records change, so the interval has to
   * read it through a ref. Depending on [repo.loading] alone captured the repo
   * from app-start and never refreshed it, which meant any reminder created
   * after launch was invisible to this loop for the life of the session.
   */
  const repoRef = useRef(repo);
  repoRef.current = repo;

  useEffect(() => {
    if (repo.loading) return;
    const run = () => {
      const r = repoRef.current;
      if (!r || r.loading) return;
      collectEvents(r, modules);
      pruneEvents(r);
    };
    run();
    const t = setInterval(run, 30_000);
    // fire immediately when you come back to the app, rather than waiting
    const onVisible = () => document.visibilityState === 'visible' && run();
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, [repo.loading]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setSearching(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // The bottom bar: your chosen modules, split evenly around the raised
  // assistant button.
  const navSize = settings.navSize;
  const chosen = (settings.nav ?? defaultNav).slice(0, navSize);
  const byId = (id) => modules.find((m) => m.id === id);
  const navItems = chosen.map(byId).filter(Boolean)
    .map((m) => ({ to: m.routes[0].path, title: m.title, icon: m.icon }));

  /**
   * The raised assistant button floats over the middle of this bar (see
   * AssistantLauncher in App.jsx) — this spacer reserves it breathing room.
   *
   * Fixed at half of navSize (2 for a 4-slot bar, 3 for 6), NOT half of
   * however many tabs happen to be chosen right now — otherwise picking an
   * odd number of modules put an uneven number on each side of the
   * assistant, throwing the whole bar off-centre.
   */
  const spacerAt = navSize / 2;

  /**
   * The visual bar always renders exactly navSize slots, padding with
   * invisible placeholders if fewer modules are chosen — a saved nav list
   * from before this setting existed (or just not having filled every slot
   * yet) would otherwise still split unevenly, since spacerAt is fixed but
   * there'd be fewer real tabs than slots to either side of it. Swipe
   * navigation uses the unpadded `navItems` below, so it only ever visits
   * real tabs.
   */
  const paddedNavItems = [
    ...navItems,
    ...Array.from({ length: Math.max(0, navSize - navItems.length) }, (_, i) => ({ empty: i })),
  ];

  // Swipe moves along the same list the bottom bar shows, so the gesture and
  // the tabs can never disagree about what comes next.
  const contentRef = useRef(null);
  const loc = useLocation();
  const idx = navItems.findIndex((n) =>
    n.end ? loc.pathname === n.to : loc.pathname.startsWith(n.to)
  );

  const goBy = useCallback((step) => {
    if (idx === -1) return;
    const next = idx + step;
    if (next < 0 || next >= navItems.length) return;
    nav(navItems[next].to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, navItems, nav]);

  useSwipeNav(contentRef, {
    onPrev: () => goBy(-1),
    onNext: () => goBy(1),
    enabled: !searching && !launching && !notifying,
  });

  return (
    <div className="shell">
      <header className="topbar">
        <span className="wordmark serif">Daybook</span>
        <div className="topbar-actions">
          {repo.cloud && repo.syncMode === 'manual' && (
            <button
              className="icon-btn"
              onClick={() => repo.syncNow()}
              disabled={repo.syncing}
              aria-label="Sync now"
              title={repo.lastSyncedAt ? `Last synced ${dueLabel(repo.lastSyncedAt)}` : 'Never synced'}
            >
              <RefreshCw size={17} className={repo.syncing ? 'spin' : ''} />
            </button>
          )}
          <NotifyBell onClick={() => setNotifying(true)} />
          <button className="icon-btn" onClick={() => setSearching(true)} aria-label="Search"><Search size={18} /></button>
          <button className="icon-btn" onClick={() => setLaunching(true)} aria-label="All apps"><LayoutGrid size={18} /></button>
          <NavLink to="/settings" className="icon-btn" aria-label="Settings"><Cog size={18} /></NavLink>
        </div>
      </header>

      {repo.syncError && (
        <div className="sync-banner" role="status">
          <CloudOff size={15} />
          <span>Not saving to the cloud — {repo.syncError}</span>
        </div>
      )}

      <main className="content" ref={contentRef}>{children}</main>

      <nav className="tabbar" aria-label="Sections">
        {paddedNavItems.map((n, i) => (
          <Fragment key={n.empty !== undefined ? `empty-${n.empty}` : n.to}>
            {i === spacerAt && <span className="tab-spacer" aria-hidden="true" />}
            {n.empty !== undefined ? (
              <span className="tab tab-empty" aria-hidden="true" />
            ) : (
              <NavLink to={n.to} end={n.end} className={({ isActive }) => `tab ${isActive ? 'is-active' : ''}`}>
                <n.icon size={19} strokeWidth={1.7} />
                <span>{n.title}</span>
              </NavLink>
            )}
          </Fragment>
        ))}
      </nav>

      <NotifyPanel open={notifying} onClose={() => setNotifying(false)} />
      <SearchOverlay open={searching} onClose={() => setSearching(false)} />
      <Launcher
        open={launching}
        onOpen={() => setLaunching(true)}
        onClose={() => setLaunching(false)}
      />
    </div>
  );
}
