import { useState, useEffect, useRef } from 'react';
import {
  KeyRound, Lock, Eye, EyeOff, Copy, Check, Search, Trash2, ShieldAlert, Fingerprint, ArrowUpDown,
} from 'lucide-react';
import { useRepo } from '../../core/db/repo';
import {
  Card, Row, SectionLabel, EmptyState, Button, Sheet, Field, Input, Select,
} from '../../core/ui/components';
import { Fab, ReorderList } from '../../core/ui/extras';
import { loadConfig } from '../../core/db/config';
import { encryptField, decryptField, wrapAesKeyWithPrf } from '../../core/crypto/personalInfo';
import { platformAuthenticatorAvailable, registerBiometric } from '../../core/crypto/webauthn';
import { saveBiometricRecord, clearBiometricRecord } from '../../core/db/biometricStore';
import { PersonalInfoSessionProvider, usePersonalInfoSession } from './session';
import PinSetup from './PinSetup';
import UnlockScreen from './UnlockScreen';
import ChangePin from './ChangePin';
import { ENTRY_TYPE } from './types';
import './personalInfo.css';

export { ENTRY_TYPE };

const REVEAL_MS = 10000;

/**
 * Manual order, once set, wins — entries without it (nothing rearranged yet,
 * or added after the last rearrange) fall back to creation order and sort
 * after anything explicitly placed, so a freshly-added entry lands at the
 * bottom instead of jumping into the middle of a deliberate arrangement.
 */
function sortByOrder(list) {
  if (!list.some((r) => typeof r.data.order === 'number')) return list;
  return [...list].sort((a, b) => {
    const ao = typeof a.data.order === 'number' ? a.data.order : Infinity;
    const bo = typeof b.data.order === 'number' ? b.data.order : Infinity;
    return ao !== bo ? ao - bo : a.createdAt.localeCompare(b.createdAt);
  });
}

/* -------------------------------- entry row -------------------------------- */

function EntryRow({ record, sessionKey, onEdit }) {
  const isSensitive = record.data.category === 'sensitive';
  const [revealed, setRevealed] = useState(null);
  const [revealing, setRevealing] = useState(false);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef(null);
  const copiedTimerRef = useRef(null);

  useEffect(() => () => { clearTimeout(timerRef.current); clearTimeout(copiedTimerRef.current); }, []);

  const toggleReveal = async (e) => {
    e.stopPropagation();
    if (revealed !== null) {
      setRevealed(null);
      clearTimeout(timerRef.current);
      return;
    }
    setRevealing(true);
    try {
      const pt = await decryptField(record.data.encrypted, record.data.iv, sessionKey);
      setRevealed(pt);
      timerRef.current = setTimeout(() => setRevealed(null), REVEAL_MS);
    } catch { /* wrong key / corrupt data — stays masked */ }
    finally { setRevealing(false); }
  };

  const copy = async (e) => {
    e.stopPropagation();
    try {
      let text = record.data.value;
      if (isSensitive) {
        text = revealed !== null ? revealed : await decryptField(record.data.encrypted, record.data.iv, sessionKey);
        setRevealed(text);
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setRevealed(null), REVEAL_MS);
      }
      await navigator.clipboard.writeText(text);
      setCopied(true);
      clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 1400);
    } catch { /* clipboard blocked, or decrypt failed */ }
  };

  return (
    <Row
      accent="var(--accent-notes)"
      onClick={() => onEdit(record)}
      title={record.title}
      meta={
        <span className="pi-value mono">
          {isSensitive ? (revealed !== null ? revealed : '••••••••') : record.data.value}
        </span>
      }
      right={
        <span className="pi-row-actions">
          <button type="button" className="icon-btn pi-row-btn" aria-label="Copy value" onClick={copy}>
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </button>
          {isSensitive && (
            <button
              type="button" className="icon-btn pi-row-btn" disabled={revealing}
              aria-label={revealed !== null ? 'Hide value' : 'Reveal value'}
              onClick={toggleReveal}
            >
              {revealed !== null ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          )}
        </span>
      }
    />
  );
}

/* -------------------------------- entry sheet -------------------------------- */

function EntrySheet({ existing, sessionKey, onClose, onSave }) {
  const isNew = !existing;
  const [label, setLabel] = useState(existing?.title || '');
  const [category, setCategory] = useState(existing?.data?.category || 'general');
  const [value, setValue] = useState(existing?.data?.category === 'general' ? existing.data.value : '');
  const [loadingValue, setLoadingValue] = useState(!isNew && existing.data.category === 'sensitive');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showValue, setShowValue] = useState(false);

  useEffect(() => {
    if (isNew || existing.data.category !== 'sensitive') return;
    let alive = true;
    decryptField(existing.data.encrypted, existing.data.iv, sessionKey)
      .then((pt) => { if (alive) setValue(pt); })
      .catch(() => { if (alive) setError("Couldn't decrypt this entry."); })
      .finally(() => { if (alive) setLoadingValue(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    if (!label.trim() || !value.trim()) return;
    setBusy(true);
    setError('');
    try {
      const patch = category === 'sensitive'
        ? { title: label.trim(), data: { category, ...(await encryptField(value, sessionKey)) } }
        : { title: label.trim(), data: { category, value } };
      await onSave(patch);
      onClose();
    } catch (e) {
      setError(e?.message || 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    await onSave(null);
    onClose();
  };

  return (
    <Sheet
      open onClose={onClose}
      title={isNew ? 'Add entry' : 'Edit entry'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={busy || loadingValue || !label.trim() || !value.trim()}>
            {isNew ? 'Save' : 'Save changes'}
          </Button>
        </>
      }
    >
      <Field label="Label">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Bank of Maldives — Savings" autoFocus />
      </Field>
      <Field label="Category" hint={!isNew ? "Can't be changed — delete and re-add under the other category instead." : undefined}>
        <Select value={category} onChange={(e) => setCategory(e.target.value)} disabled={!isNew}>
          <option value="general">General</option>
          <option value="sensitive">Sensitive (encrypted)</option>
        </Select>
      </Field>
      <Field label="Value" hint={category === 'sensitive' ? 'Encrypted on this device before it ever reaches the cloud.' : undefined}>
        <div className="pi-value-field">
          <Input
            type={category === 'sensitive' && !showValue ? 'password' : 'text'}
            value={loadingValue ? '' : value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={loadingValue ? 'Decrypting…' : ''}
            disabled={loadingValue}
          />
          {category === 'sensitive' && (
            <Button
              size="sm" variant="outline" type="button" disabled={loadingValue}
              onClick={() => setShowValue((v) => !v)}
              aria-label={showValue ? 'Hide value' : 'Show value'}
            >
              {showValue ? <EyeOff size={15} /> : <Eye size={15} />}
            </Button>
          )}
        </div>
      </Field>
      {error && <p className="field-hint pin-error">{error}</p>}
      {!isNew && (
        <Button variant="danger" size="sm" onClick={remove}>
          <Trash2 size={14} /> Delete entry
        </Button>
      )}
    </Sheet>
  );
}

/* -------------------------------- screen -------------------------------- */

function PageHeading({ children }) {
  return (
    <div className="page-head pi-page-head">
      <h1 className="page-title serif">Personal Info</h1>
      {children}
    </div>
  );
}

function PersonalInfoInner() {
  const repo = useRepo();
  const session = usePersonalInfoSession();
  const [security, setSecurity] = useState(undefined); // undefined = loading, null = not set up yet
  const [loadError, setLoadError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState(undefined); // undefined = closed, null = new, record = edit
  const [changingPin, setChangingPin] = useState(false);
  const [query, setQuery] = useState('');
  const [bioSupported, setBioSupported] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);
  const [rearranging, setRearranging] = useState(false);
  const [draftGeneral, setDraftGeneral] = useState(null);
  const [draftSensitive, setDraftSensitive] = useState(null);

  const hasCloud = repo.cloud && !!repo.uid;

  useEffect(() => { platformAuthenticatorAvailable().then(setBioSupported); }, []);
  const retry = () => { setLoadError(null); setSecurity(undefined); setReloadKey((k) => k + 1); };

  useEffect(() => {
    if (!hasCloud) { setSecurity(null); return; }
    let alive = true;
    (async () => {
      try {
        const { getSecurityDoc } = await import('../../core/db/security');
        const doc = await getSecurityDoc(loadConfig(), repo.uid);
        if (alive) setSecurity(doc);
      } catch (e) {
        if (alive) setLoadError(e?.message || 'Could not reach your Personal Info settings.');
      }
    })();
    return () => { alive = false; };
  }, [hasCloud, repo.uid, reloadKey]);

  if (!hasCloud) {
    return (
      <div className="page">
        <PageHeading />
        <Card>
          <EmptyState
            icon={ShieldAlert}
            title="Requires cloud sync"
            body="Personal Info is protected by your Firebase account — sign in under Settings → Cloud sync first."
          />
        </Card>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="page">
        <PageHeading />
        <Card>
          <EmptyState
            icon={ShieldAlert}
            title="Couldn't check your Personal Info setup"
            body={`${loadError} If you just set this up, make sure the updated security rules (Settings → Cloud sync → Security rules) are pasted into the Firebase console.`}
            action={<Button size="sm" variant="outline" onClick={retry}>Try again</Button>}
          />
        </Card>
      </div>
    );
  }

  if (security === undefined) {
    return (
      <div className="page">
        <PageHeading />
        <Card><EmptyState icon={KeyRound} title="Checking…" body="Looking up your Personal Info setup." /></Card>
      </div>
    );
  }

  if (!security) {
    return (
      <div className="page">
        <PageHeading />
        <PinSetup uid={repo.uid} onDone={setSecurity} />
      </div>
    );
  }

  if (!session.isUnlocked) {
    return (
      <div className="page">
        <PageHeading />
        <UnlockScreen security={security} uid={repo.uid} />
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const matches = (r) => r.title.toLowerCase().includes(q)
    // Sensitive values are never decrypted just to search — only the label matches.
    || (r.data.category === 'general' && (r.data.value || '').toLowerCase().includes(q));
  const entries = repo.query({ type: ENTRY_TYPE }).filter((r) => !q || matches(r));
  const general = sortByOrder(entries.filter((r) => r.data.category === 'general'));
  const sensitive = sortByOrder(entries.filter((r) => r.data.category === 'sensitive'));
  const noMatches = !!q && general.length === 0 && sensitive.length === 0;

  const startRearrange = () => {
    setQuery('');
    setDraftGeneral(sortByOrder(repo.query({ type: ENTRY_TYPE }).filter((r) => r.data.category === 'general')));
    setDraftSensitive(sortByOrder(repo.query({ type: ENTRY_TYPE }).filter((r) => r.data.category === 'sensitive')));
    setRearranging(true);
  };

  const cancelRearrange = () => {
    setRearranging(false);
    setDraftGeneral(null);
    setDraftSensitive(null);
  };

  const saveRearrange = () => {
    [draftGeneral, draftSensitive].forEach((list) => {
      list.forEach((r, idx) => {
        if (r.data.order !== idx) repo.update(r.id, { data: { ...r.data, order: idx } });
      });
    });
    cancelRearrange();
  };

  const onSaveEntry = async (patch) => {
    if (patch === null) { repo.softDelete(editing.id); return; }
    if (editing) repo.update(editing.id, patch);
    else repo.create(ENTRY_TYPE, patch);
  };

  const enableBiometric = async () => {
    setBioBusy(true);
    try {
      const reg = await registerBiometric(repo.uid);
      if (!reg) return; // unsupported/cancelled — no error, button just stays as "Enable"
      const wrapped = await wrapAesKeyWithPrf(session.key, reg.prfSecret);
      await saveBiometricRecord(repo.uid, { credentialId: reg.credentialId, encrypted: wrapped.encrypted, iv: wrapped.iv });
      const next = { ...security, biometricEnabled: true };
      const { setSecurityDoc } = await import('../../core/db/security');
      await setSecurityDoc(loadConfig(), repo.uid, next);
      setSecurity(next);
    } finally {
      setBioBusy(false);
    }
  };

  const disableBiometric = async () => {
    setBioBusy(true);
    try {
      await clearBiometricRecord(repo.uid);
      const next = { ...security, biometricEnabled: false };
      const { setSecurityDoc } = await import('../../core/db/security');
      await setSecurityDoc(loadConfig(), repo.uid, next);
      setSecurity(next);
    } finally {
      setBioBusy(false);
    }
  };

  if (rearranging) {
    return (
      <div className="page">
        <PageHeading>
          <div className="pi-head-actions">
            <Button size="sm" onClick={cancelRearrange}>Cancel</Button>
            <Button size="sm" variant="primary" onClick={saveRearrange}>Save order</Button>
          </div>
        </PageHeading>

        <SectionLabel>General — drag to reorder</SectionLabel>
        <Card>
          {draftGeneral.length === 0 ? (
            <EmptyState icon={KeyRound} title="Nothing here yet" body="Name, address, anything not sensitive." />
          ) : (
            <ReorderList
              items={draftGeneral.map((r) => ({ id: r.id, label: r.title }))}
              onReorder={(ids) => setDraftGeneral(ids.map((id) => draftGeneral.find((r) => r.id === id)))}
              renderItem={(item) => <span className="pi-reorder-label">{item.label}</span>}
            />
          )}
        </Card>

        <SectionLabel>Sensitive — encrypted</SectionLabel>
        <Card>
          {draftSensitive.length === 0 ? (
            <EmptyState icon={Lock} title="Nothing here yet" body="Passwords, account numbers — encrypted before they leave this device." />
          ) : (
            <ReorderList
              items={draftSensitive.map((r) => ({ id: r.id, label: r.title }))}
              onReorder={(ids) => setDraftSensitive(ids.map((id) => draftSensitive.find((r) => r.id === id)))}
              renderItem={(item) => <span className="pi-reorder-label">{item.label}</span>}
            />
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="page has-fab">
      <PageHeading>
        <div className="pi-head-actions">
          {security.biometricEnabled ? (
            <Button size="sm" variant="outline" onClick={disableBiometric} disabled={bioBusy}>
              <Fingerprint size={14} /> Disable fingerprint
            </Button>
          ) : bioSupported && (
            <Button size="sm" variant="outline" onClick={enableBiometric} disabled={bioBusy}>
              <Fingerprint size={14} /> Enable fingerprint
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setChangingPin(true)}>
            <KeyRound size={14} /> Change PIN
          </Button>
          <Button size="sm" variant="outline" onClick={startRearrange}>
            <ArrowUpDown size={14} /> Rearrange
          </Button>
          <Button size="sm" variant="outline" onClick={() => session.lock()}>
            <Lock size={14} /> Lock
          </Button>
        </div>
      </PageHeading>

      <div className="pi-search">
        <Search size={15} />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by label…" />
      </div>

      {noMatches ? (
        <Card><EmptyState icon={Search} title="No matches" body={`Nothing found for "${query.trim()}".`} /></Card>
      ) : (
        <>
          {(general.length > 0 || !q) && (
            <>
              <SectionLabel>General</SectionLabel>
              {general.length === 0 ? (
                <Card><EmptyState icon={KeyRound} title="Nothing here yet" body="Name, address, anything not sensitive." /></Card>
              ) : (
                <Card><div className="ruled">
                  {general.map((r) => <EntryRow key={r.id} record={r} sessionKey={session.key} onEdit={setEditing} />)}
                </div></Card>
              )}
            </>
          )}

          {(sensitive.length > 0 || !q) && (
            <>
              <SectionLabel>Sensitive — encrypted</SectionLabel>
              {sensitive.length === 0 ? (
                <Card><EmptyState icon={Lock} title="Nothing here yet" body="Passwords, account numbers — encrypted before they leave this device." /></Card>
              ) : (
                <Card><div className="ruled">
                  {sensitive.map((r) => <EntryRow key={r.id} record={r} sessionKey={session.key} onEdit={setEditing} />)}
                </div></Card>
              )}
            </>
          )}
        </>
      )}

      {editing !== undefined && (
        <EntrySheet
          existing={editing || undefined}
          sessionKey={session.key}
          onClose={() => setEditing(undefined)}
          onSave={onSaveEntry}
        />
      )}

      <ChangePin
        open={changingPin}
        onClose={() => setChangingPin(false)}
        uid={repo.uid}
        security={security}
        repo={repo}
        onChanged={(newSecurity, newKey) => { setSecurity(newSecurity); session.unlockWithKey(newKey); }}
      />

      <Fab label="Add entry" onClick={() => setEditing(null)} />
    </div>
  );
}

export function PersonalInfoScreen() {
  return (
    <PersonalInfoSessionProvider>
      <PersonalInfoInner />
    </PersonalInfoSessionProvider>
  );
}

/* ------------------------------- manifest ------------------------------ */

export default {
  id: 'personalInfo',
  title: 'Personal Info',
  icon: KeyRound,
  accent: 'var(--accent-notes)',
  tier: 'integrated',
  routes: [{ path: '/personal-info', element: <PersonalInfoScreen /> }],
  // Deliberately never surfaces a title or value outside the unlocked module
  // — no search results, no ref chip with real content.
  renderRef: () => <span className="ref-chip">Personal Info</span>,
  search: () => [],
  quickActions: [],
};
