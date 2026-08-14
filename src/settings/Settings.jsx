import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Settings as Cog, Palette, LayoutGrid, BellRing, Info, ArrowLeft,
  Sun, Moon, Monitor, BookOpen, Check, AlertCircle, Cloud, Copy, LogOut, Home, KeyRound,
} from 'lucide-react';
import { useRepo } from '../core/db/repo';
import {
  loadConfig, saveConfig, parseConfig, isCustomConfig, DEFAULT_CONFIG,
  FIRESTORE_RULES, SYNC_MODES,
} from '../core/db/config';
import { clearLastUid } from '../core/db/mirror';
import { dueLabel } from '../core/dates';
import { useSettings } from '../core/settings/settings';
import { ReorderList } from '../core/ui/extras';
import { integrated, hostedApps, modules, defaultNav } from '../registry';
import {
  Card, SectionLabel, Toggle, OptionRow, Button, Chip, Field, Input, Textarea,
} from '../core/ui/components';
import {
  pushSupported, permission, enablePush, disablePush, sendTestNotification,
  SUB_TYPE, subToJSON,
} from '../core/notifications/push';
import './settings-page.css';

const TABS = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'layout', label: 'Layout', icon: LayoutGrid },
  { id: 'notifications', label: 'Notifications', icon: BellRing },
  { id: 'cloud', label: 'Cloud sync', icon: Cloud },
  { id: 'about', label: 'About', icon: Info },
];

/* ------------------------------ appearance ----------------------------- */

const THEMES = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'System', icon: Monitor },
  { id: 'paper', label: 'Paper', icon: BookOpen },
];

function Appearance() {
  const s = useSettings();
  return (
    <>
      <SectionLabel>Theme</SectionLabel>
      <div className="theme-grid">
        {THEMES.map((t) => (
          <button
            key={t.id}
            className={`theme-tile ${s.theme === t.id ? 'is-active' : ''}`}
            onClick={() => s.setTheme(t.id)}
          >
            <span className={`swatch swatch-${t.id}`}><t.icon size={15} /></span>
            <span className="theme-name">{t.label}</span>
            {s.theme === t.id && <Check className="theme-check" size={15} />}
          </button>
        ))}
      </div>
      <p className="settings-note">
        System follows your device. Paper is the original ledger cream, if you miss it.
      </p>
    </>
  );
}

/* -------------------------------- layout ------------------------------- */

function Layout() {
  const s = useSettings();

  // Bottom bar: Today is now optional. The pool includes "today" plus all
  // modules, so the user can pick any combination of up to navSize items —
  // always split evenly around the assistant button (see AppShell's spacerAt).
  const navPool = [
    { id: 'today', title: 'Today', icon: Home, accent: 'var(--ink)', tier: 'virtual' },
    ...integrated.filter((m) => m.id !== 'trash'),
    ...hostedApps,
  ];
  const current = (s.nav ?? defaultNav).slice(0, s.navSize);
  const inNav = (id) => current.includes(id);
  const byId = (id) => navPool.find((m) => m.id === id);

  const toggleNav = (id) => {
    if (inNav(id)) s.setNav(current.filter((x) => x !== id));
    else if (current.length < s.navSize) s.setNav([...current, id]);
  };

  return (
    <>
      <SectionLabel>Today — which modules can appear</SectionLabel>
      <Card>
        <div className="ruled">
          {integrated.filter((m) => m.id !== 'trash').map((m) => (
            <OptionRow
              key={m.id}
              icon={m.icon}
              iconColor={m.accent}
              title={m.title}
              hint={
                m.id === 'inbox' ? 'Unsorted captures'
                  : m.id === 'reminders' ? 'Due & overdue only'
                  : m.id === 'payments' ? 'Due & overdue only'
                  : m.id === 'directory' ? 'Lookup — never surfaces on Today'
                  : m.id === 'mandarin' ? 'Vocab drills — never surfaces on Today'
                  : 'Lists with open items'
              }
              control={<Toggle checked={s.moduleShownOnHome(m.id)} onChange={(v) => s.toggleModuleOnHome(m.id, v)} label={`Show ${m.title} on Today`} />}
            />
          ))}
        </div>
      </Card>
      <p className="settings-note">
        This controls whether a module <em>can</em> surface on Today. What shows is still the rule —
        reminders only when due or overdue, lists only when they have open items. Pin a single item to
        override the rule, or hide one to keep it in its module.
      </p>

      <SectionLabel>Apps on Today</SectionLabel>
      <Card>
        <div className="ruled">
          <OptionRow
            title="Show the Apps section"
            hint="Quick-launch shortcuts at the bottom of Today."
            control={<Toggle checked={s.home.showApps} onChange={(v) => s.setHome({ showApps: v })} label="Show Apps section" />}
          />
          {s.home.showApps && [...integrated.filter((m) => m.id !== 'trash'), ...hostedApps].map((a) => (
            <OptionRow
              key={a.id}
              icon={a.icon}
              iconColor={a.accent}
              title={a.title}
              control={<Toggle checked={s.appShownOnHome(a.id)} onChange={(v) => s.toggleAppOnHome(a.id, v)} label={`Show ${a.title} on Today`} />}
            />
          ))}
        </div>
      </Card>

      <SectionLabel>Bottom bar size</SectionLabel>
      <Card>
        <OptionRow
          title="Slots"
          hint="Always split evenly around Ask Daybook — the first half of the list below sits on the left, the rest on the right."
          control={
            <div className="segmented" role="radiogroup" aria-label="Bottom bar size">
              {[4, 6].map((n) => (
                <button
                  key={n} type="button" role="radio" aria-checked={s.navSize === n}
                  className={`segment ${s.navSize === n ? 'is-on' : ''}`}
                  onClick={() => s.setNavSize(n)}
                >
                  {n} ({n / 2}+{n / 2})
                </button>
              ))}
            </div>
          }
        />
      </Card>

      <SectionLabel right={<span className="mono count">{current.length}/{s.navSize}</span>}>
        Bottom bar
      </SectionLabel>
      <Card>
        {current.length > 0 && (
          <>
            <div className="settings-subhead eyebrow">In the bar — drag to reorder</div>
            <ReorderList
              items={current.map(byId).filter(Boolean).map((m) => ({ id: m.id, label: m.title, m }))}
              onReorder={(ids) => s.setNav(ids)}
              renderItem={({ m }) => (
                <OptionRow
                  icon={m.icon}
                  iconColor={m.accent}
                  title={m.title}
                  hint={m.id === 'today' ? 'Home screen' : m.tier === 'hosted' ? 'App' : 'Module'}
                  control={
                    <Toggle checked onChange={() => toggleNav(m.id)} label={`Remove ${m.title}`} />
                  }
                />
              )}
            />
          </>
        )}

        {navPool.some((m) => !inNav(m.id)) && (
          <>
            <div className="settings-subhead eyebrow">Not in the bar</div>
            <div className="ruled">
              {navPool.filter((m) => !inNav(m.id)).map((m) => (
                <OptionRow
                  key={m.id}
                  icon={m.icon}
                  iconColor={m.accent}
                  title={m.title}
                  hint={current.length >= s.navSize ? 'Bar is full — remove one first' : (m.id === 'today' ? 'Home screen' : m.tier === 'hosted' ? 'App' : 'Module')}
                  control={
                    <Toggle
                      checked={false}
                      onChange={() => toggleNav(m.id)}
                      label={`Add ${m.title}`}
                    />
                  }
                />
              ))}
            </div>
          </>
        )}
      </Card>
      <p className="settings-note">
        Fill all {s.navSize} slots for a balanced bar — drag to set their order, the first{' '}
        {s.navSize / 2} sit left of Ask Daybook and the rest sit right, and that split never
        moves regardless of how many you've picked. Everything else is one tap away — the grid
        icon up top, or the drawer handle at the right edge of the screen. Swiping left and right
        follows this same order.
      </p>
    </>
  );
}

/* ----------------------------- notifications --------------------------- */

function Notifications() {
  const s = useSettings();
  const repo = useRepo();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const perm = permission();
  const supported = pushSupported();

  const categories = modules.flatMap((m) =>
    (m.notifications || []).map((c) => ({
      ...c,
      moduleTitle: m.title,
      moduleIcon: m.icon,
      moduleAccent: m.accent,
    }))
  );

  /**
   * Enabling has to SAVE the subscription, not just create it. Without a
   * stored endpoint the scheduled sender has nowhere to deliver, which is
   * exactly how scheduled reminders end up silently doing nothing.
   */
  const enable = async (on) => {
    setError(null); setBusy(true);
    try {
      if (on) {
        const res = await enablePush();
        if (res.subscription) {
          const json = subToJSON(res.subscription);
          const existing = repo.query({ type: SUB_TYPE })
            .find((r) => r.data.endpoint === json.endpoint);
          if (!existing) {
            repo.create(SUB_TYPE, {
              title: 'Push device',
              home: 'hidden',
              data: { ...json, agent: navigator.userAgent.slice(0, 120) },
            });
          }
        }
        s.setNotifications({ enabled: true, local: !!res.local });
      } else {
        await disablePush();
        repo.query({ type: SUB_TYPE }).forEach((r) => repo.softDelete(r.id));
        s.setNotifications({ enabled: false });
      }
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const test = async () => {
    setError(null);
    try { await sendTestNotification(); } catch (e) { setError(e.message); }
  };

  if (!supported) {
    return (
      <Card>
        <div className="notify-blocked">
          <AlertCircle size={18} />
          <p>This browser doesn't support notifications. On iPhone, add Daybook to your Home Screen first, then open it from there.</p>
        </div>
      </Card>
    );
  }

  return (
    <>
      <SectionLabel>Push notifications</SectionLabel>
      <Card>
        <div className="ruled">
          <OptionRow
            icon={BellRing}
            iconColor="var(--toggle-on)"
            title="Enable on this device"
            hint="Subscribe this device to receive alerts based on your choices below."
            control={<Toggle checked={s.notifications.enabled} onChange={enable} label="Enable notifications" />}
          />
          {s.notifications.enabled && (
            <div className="notify-status">
              <span className={`status-dot ${perm === 'granted' ? 'ok' : 'warn'}`} />
              {perm === 'granted' ? 'Subscribed on this device' : 'Waiting for permission'}
              <button className="link-btn" onClick={test} disabled={busy}>Send a test</button>
            </div>
          )}
        </div>
      </Card>
      {error && <p className="settings-error"><AlertCircle size={14} /> {error}</p>}

      <SectionLabel>Choose what to be alerted about</SectionLabel>
      <Card>
        {categories.length === 0 ? (
          <p className="settings-note" style={{ padding: 'var(--sp-4)' }}>No modules offer alerts yet.</p>
        ) : (
          <div className="ruled">
            {categories.map((c) => (
              <OptionRow
                key={c.id}
                icon={c.moduleIcon}
                iconColor={c.moduleAccent}
                title={c.label}
                hint={c.hint}
                control={
                  <Toggle
                    checked={s.notifications.prefs[c.id] ?? c.default ?? true}
                    onChange={(v) => s.toggleNotifyPref(c.id, v)}
                    label={c.label}
                  />
                }
              />
            ))}
          </div>
        )}
      </Card>

      <p className="settings-note">
        Two different things here. <em>While the app is open</em>, anything that comes due
        raises a notification on this device straight away — no server involved. <em>Waking a
        closed phone</em> needs the scheduled sender in <span className="mono">netlify/functions</span>,
        which needs cloud sync on and Firebase Admin credentials set in Netlify. Until then the
        in-app bell still catches everything the moment you open the app.
      </p>
    </>
  );
}


/* ------------------------------ cloud sync ----------------------------- */

function CloudSync() {
  const repo = useRepo();
  const nav = useNavigate();
  const [custom, setCustom] = useState(() => isCustomConfig());
  const [cfgText, setCfgText] = useState(() => {
    const c = loadConfig();
    return c ? JSON.stringify(c, null, 2) : '';
  });
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [note, setNote] = useState(null);
  const [showRules, setShowRules] = useState(false);

  const configured = repo.configured;
  const connected = repo.cloud;

  const saveCfg = () => {
    setError(null); setNote(null);
    try {
      const cfg = parseConfig(cfgText);
      saveConfig(cfg);
      setCustom(true);
      setNote('Config saved. Reloading…');
      setTimeout(() => window.location.reload(), 600);
    } catch (e) { setError(e.message); }
  };

  const doAuth = async (isNew) => {
    setError(null); setNote(null); setBusy(true);
    try {
      const cfg = loadConfig();
      if (!cfg) throw new Error('Save your Firebase config first.');
      const fb = await import('../core/db/firebase');
      if (isNew) await fb.signUp(cfg, email.trim(), pw);
      else await fb.signIn(cfg, email.trim(), pw);
      setPw('');
      setNote('Signed in.');
    } catch (e) {
      setError(e.message?.replace('Firebase: ', '') || 'Sign-in failed.');
    } finally { setBusy(false); }
  };

  const upload = async () => {
    setError(null); setNote(null); setBusy(true);
    try {
      const n = await repo.uploadLocalToCloud();
      setNote(n === 0 ? 'Nothing on this device to upload.' : `Uploaded ${n} records.`);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const disconnect = async () => {
    try {
      const fb = await import('../core/db/firebase');
      await fb.signOut(loadConfig());
      fb.resetFirebase();
    } catch { /* already out */ }
    saveConfig(null);
    // Otherwise the next launch — even before auth resolves — would paint
    // this account's cached data for whoever opens the app next.
    clearLastUid();
    window.location.reload();
  };

  const copyRules = () => {
    navigator.clipboard?.writeText(FIRESTORE_RULES);
    setNote('Rules copied.');
  };

  return (
    <>
      <SectionLabel>Status</SectionLabel>
      <Card>
        <div className="ruled">
          <OptionRow
            icon={Cloud}
            iconColor={connected ? 'var(--in)' : 'var(--muted)'}
            title={connected ? 'Syncing to your Firebase' : configured ? 'Configured, not signed in' : 'Saving to this device only'}
            hint={connected
              ? 'Changes appear on every device you sign in on.'
              : 'Data lives in this browser. Clearing site data would lose it.'}
            control={<span className={`status-dot ${connected ? 'ok' : 'warn'}`} />}
          />
        </div>
      </Card>

      {connected && (
        <>
          <SectionLabel>How often to sync</SectionLabel>
          <Card>
            <div className="ruled">
              {SYNC_MODES.map((m) => (
                <OptionRow
                  key={m.id}
                  title={m.label}
                  hint={m.hint}
                  control={
                    <Toggle
                      checked={repo.syncMode === m.id}
                      onChange={() => repo.setSyncMode(m.id)}
                      label={m.label}
                    />
                  }
                />
              ))}
            </div>
          </Card>
          <p className="settings-note">
            Firestore charges per document read, so this only controls <em>reads</em>.
            Your edits always upload straight away — writes are cheap and you make few.
          </p>

          <SectionLabel right={
            <Button size="sm" variant="outline" onClick={() => repo.syncNow()} disabled={repo.syncing}>
              {repo.syncing ? 'Syncing…' : 'Sync now'}
            </Button>
          }>
            Usage
          </SectionLabel>
          <Card>
            <div className="ruled">
              <OptionRow
                title="Last synced"
                hint={repo.lastSyncedAt ? dueLabel(repo.lastSyncedAt) : 'Not yet'}
                control={<span className="mono count">{repo.lastReads ?? '—'} reads</span>}
              />
              <OptionRow
                title="Reads since setup"
                hint="Free tier allows 50,000 a day. Searching and opening the app cost nothing."
                control={<span className="mono count">{repo.totalReads.toLocaleString()}</span>}
              />
              <OptionRow
                title="Records held on this device"
                hint="Kept locally, so search and reload never touch the cloud."
                control={<span className="mono count">{repo.all.length.toLocaleString()}</span>}
              />
            </div>
          </Card>
        </>
      )}

      <SectionLabel right={
        custom && DEFAULT_CONFIG
          ? <Button size="sm" variant="quiet" onClick={() => {
              saveConfig(null);
              setCfgText(DEFAULT_CONFIG ? JSON.stringify(DEFAULT_CONFIG, null, 2) : '');
              setCustom(false);
              setNote('Back to the built-in project. Reloading…');
              setTimeout(() => window.location.reload(), 600);
            }}>Use built-in</Button>
          : null
      }>
        Firebase project
      </SectionLabel>
      <Card>
        <div style={{ padding: 'var(--sp-4)' }}>
          <p className="about-line muted" style={{ marginBottom: 'var(--sp-3)' }}>
            {custom
              ? 'Using a config you saved on this device.'
              : DEFAULT_CONFIG
                ? `Using the built-in project (${DEFAULT_CONFIG.projectId}). Paste another below to switch.`
                : 'No project configured yet. Paste your Firebase config below to turn on sync.'}
          </p>
          <Field label="Firebase config" hint="Project settings → Your apps → Web app → Config. The whole snippet is fine.">
            <Textarea
              rows={8}
              value={cfgText}
              onChange={(e) => setCfgText(e.target.value)}
              placeholder={'{\n  "apiKey": "...",\n  "authDomain": "...",\n  "projectId": "...",\n  "appId": "..."\n}'}
              style={{ fontFamily: 'var(--mono)', fontSize: 12.5 }}
            />
          </Field>
          <Button variant="primary" size="sm" onClick={saveCfg}>Save config</Button>
        </div>
      </Card>
      <p className="settings-note">
        A Firebase config isn't a secret — every Firebase app ships it in the browser. What
        protects your data is the rules below, which scope every document to its owner. Once
        you've created your own account, it's worth turning off new sign-ups in the Firebase
        console so nobody else can create one in the project.
      </p>

      <SectionLabel>Sign in</SectionLabel>
      <Card>
        <div style={{ padding: 'var(--sp-4)' }}>
          {connected ? (
            <>
              <p className="about-line">Signed in. Records sync automatically.</p>
              <p className="about-line muted mono" style={{ fontSize: 12 }}>{repo.uid}</p>
              <div style={{ display: 'flex', gap: 'var(--sp-2)', marginTop: 'var(--sp-3)', flexWrap: 'wrap' }}>
                <Button size="sm" variant="outline" onClick={upload} disabled={busy}>
                  Upload this device's data
                </Button>
                <Button size="sm" variant="danger" onClick={disconnect}>
                  <LogOut size={14} /> Disconnect
                </Button>
              </div>
              <p className="settings-note">
                Upload is a one-time move for whatever you created before switching sync on.
                Safe to run twice — records keep their IDs, so nothing duplicates.
              </p>
            </>
          ) : (
            <>
              <Field label="Email">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
              </Field>
              <Field label="Password">
                <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
              </Field>
              <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                <Button variant="primary" size="sm" onClick={() => doAuth(false)} disabled={busy || !configured}>
                  Sign in
                </Button>
                <Button variant="outline" size="sm" onClick={() => doAuth(true)} disabled={busy || !configured}>
                  Create account
                </Button>
              </div>
              <p className="settings-note">
                Enable Email/Password under Authentication → Sign-in method in the Firebase
                console first, then create your account here once.
              </p>
            </>
          )}
        </div>
      </Card>

      {connected && (
        <>
          <SectionLabel>Personal Info</SectionLabel>
          <Card>
            <div style={{ padding: 'var(--sp-4)' }}>
              <p className="about-line muted" style={{ marginBottom: 'var(--sp-3)' }}>
                Passwords, account numbers and other sensitive fields are encrypted with a
                key derived from a PIN you set — never stored in plain text, even here.
              </p>
              <Button size="sm" variant="outline" onClick={() => nav('/personal-info')}>
                <KeyRound size={14} /> Open Personal Info
              </Button>
            </div>
          </Card>
        </>
      )}

      <SectionLabel right={<Button size="sm" variant="quiet" onClick={copyRules}><Copy size={13} /> Copy</Button>}>
        Security rules
      </SectionLabel>
      <Card>
        <div style={{ padding: 'var(--sp-4)' }}>
          <p className="about-line muted" style={{ marginBottom: 'var(--sp-3)' }}>
            Paste these into Firestore → Rules and publish. Without them your database is
            either wide open or locked shut.
          </p>
          <Button size="sm" variant="outline" onClick={() => setShowRules((v) => !v)}>
            {showRules ? 'Hide' : 'Show'} rules
          </Button>
          {showRules && <pre className="rules-block mono">{FIRESTORE_RULES}</pre>}
        </div>
      </Card>

      {error && <p className="settings-error"><AlertCircle size={14} /> {error}</p>}
      {note && <p className="settings-note" style={{ color: 'var(--in)', fontWeight: 600 }}>{note}</p>}
    </>
  );
}

/* -------------------------------- about -------------------------------- */


function About() {
  const repo = useRepo();
  const built = (() => {
    try { return new Date(__BUILD_TIME__); } catch { return null; }
  })();

  return (
    <>
      <Card>
        <div className="about">
          <p className="about-name serif">Daybook <span className="about-version mono">v{__APP_VERSION__}</span></p>
          <p className="about-line">One shell, many modules. Your reminders, lists, notes and apps in one place.</p>
          <p className="about-line muted">
            {repo.cloud ? 'Syncing to your Firebase project.' : 'Storing to this device only.'}
          </p>
        </div>
      </Card>

      <SectionLabel>This build</SectionLabel>
      <Card>
        <div className="ruled">
          <OptionRow
            title="Version"
            hint="Matches the version in the zip filename."
            control={<span className="mono count">v{__APP_VERSION__}</span>}
          />
          <OptionRow
            title="Build"
            hint={built ? built.toLocaleString() : 'unknown'}
            control={<span className="mono count">{__BUILD_ID__}</span>}
          />
          <OptionRow
            title="Modules loaded"
            hint={modules.map((m) => m.id).join(', ')}
            control={<span className="mono count">{modules.length}</span>}
          />
        </div>
      </Card>
      <p className="settings-note">
        If the build time here is older than the code you last deployed, the site is serving a
        previous deploy — a failed build leaves the last successful one live, so a fix can
        appear not to have worked when it simply never went out.
      </p>
    </>
  );
}

/* -------------------------------- page --------------------------------- */

export default function Settings() {
  const nav = useNavigate();
  const [tab, setTab] = useState('appearance');
  return (
    <div className="page">
      <button className="back" onClick={() => nav(-1)}><ArrowLeft size={15} /> Back</button>
      <div className="settings-head">
        <span className="settings-badge"><Cog size={18} /></span>
        <h1 className="page-title serif">Settings</h1>
      </div>

      <div className="tab-scroll" role="tablist" data-no-swipe>
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`pill ${tab === t.id ? 'is-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      <div className="settings-body">
        {tab === 'appearance' && <Appearance />}
        {tab === 'layout' && <Layout />}
        {tab === 'notifications' && <Notifications />}
        {tab === 'cloud' && <CloudSync />}
        {tab === 'about' && <About />}
      </div>
    </div>
  );
}
