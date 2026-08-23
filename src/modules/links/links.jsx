import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Link2, Copy, Check, Pencil, Trash2, ClipboardPaste, X, Plus,
} from 'lucide-react';
import { useRepo } from '../../core/db/repo';
import {
  Card, Row, SectionLabel, EmptyState, Button, Sheet, Field, Input, Textarea, Chip,
} from '../../core/ui/components';
import { Fab, HomeVisibility } from '../../core/ui/extras';
import { registerProvider } from '../../core/dashboardRegistry';
import './links.css';

export const TYPE = 'links.link';
const TAGSTORE = 'links.tagstore'; // single record holding the master tag list

/** Normalise a URL for display and for opening. Adds https:// if the user
 *  pasted a bare domain, so tapping the link actually works. */
function normalizeUrl(raw) {
  const s = (raw || '').trim();
  if (!s) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return s;   // already has a scheme
  if (/^(mailto:|tel:)/i.test(s)) return s;
  return `https://${s}`;
}

/** A short, readable label for a URL — hostname without www, or the raw
 *  string if it doesn't parse. */
function prettyUrl(raw) {
  try {
    const u = new URL(normalizeUrl(raw));
    return u.hostname.replace(/^www\./, '') + (u.pathname !== '/' ? u.pathname : '');
  } catch { return raw; }
}

/* ---- master tag list: stored as one record so it syncs like everything else ---- */

function useTagStore() {
  const repo = useRepo();
  const rec = repo.query({ type: TAGSTORE })[0] || null;
  const tags = rec?.data?.tags || [];

  const save = (next) => {
    const clean = [...new Set(next.map((t) => t.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    if (rec) repo.update(rec.id, { data: { tags: clean } });
    else repo.create(TAGSTORE, { title: 'Link tags', data: { tags: clean } });
  };

  return {
    tags,
    add: (t) => save([...tags, t]),
    remove: (t) => save(tags.filter((x) => x !== t)),
  };
}

/* -------------------------------- editor -------------------------------- */

export const renderEditor = (record, close) => (
  <LinkSheet existing={record || undefined} onClose={close} />
);

function LinkSheet({ existing, onClose }) {
  const repo = useRepo();
  const isNew = !existing;
  const store = useTagStore();
  const [url, setUrl] = useState(existing?.data?.url || '');
  const [title, setTitle] = useState(existing?.title || '');
  const [desc, setDesc] = useState(existing?.data?.desc || '');
  const [tags, setTags] = useState(existing?.tags || []);
  const [newTag, setNewTag] = useState('');
  const [pasteErr, setPasteErr] = useState(false);
  const [home, setHome] = useState(existing?.home || 'auto');

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setUrl(text.trim());
    } catch { setPasteErr(true); setTimeout(() => setPasteErr(false), 1800); }
  };

  const toggleTag = (t) => setTags((cur) => cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]);

  const addNewTag = () => {
    const t = newTag.trim();
    if (!t) return;
    store.add(t);
    if (!tags.includes(t)) setTags([...tags, t]);
    setNewTag('');
  };

  const save = () => {
    if (!url.trim()) return;
    const payload = {
      title: title.trim() || prettyUrl(url),
      tags, home,
      data: { url: url.trim(), desc: desc.trim() },
    };
    if (isNew) repo.create(TYPE, payload);
    else repo.update(existing.id, payload);
    onClose();
  };

  return (
    <Sheet
      open onClose={onClose}
      title={isNew ? 'Save a link' : 'Edit link'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!url.trim()}>{isNew ? 'Save' : 'Save changes'}</Button>
        </>
      }
    >
      <Field label="Link or address" hint={pasteErr ? "Couldn't read the clipboard — paste manually." : 'Instagram, YouTube, a website…'}>
        <div className="link-url-field">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" autoFocus inputMode="url" />
          <Button size="sm" variant="outline" onClick={paste} aria-label="Paste"><ClipboardPaste size={15} /></Button>
        </div>
      </Field>

      <Field label="Title" hint="Optional — defaults to the site name.">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What is this?" />
      </Field>

      <Field label="Description">
        <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} placeholder="Why you're saving it…" />
      </Field>

      <Field label="Tags">
        {store.tags.length === 0 && tags.length === 0
          ? <p className="field-hint" style={{ margin: 0 }}>No tags yet — add one below.</p>
          : (
            <div className="tag-choose">
              {store.tags.map((t) => (
                <button key={t} type="button" className={`tag-choose-btn ${tags.includes(t) ? 'is-on' : ''}`} onClick={() => toggleTag(t)}>
                  {t}
                  <span role="button" tabIndex={0} className="tag-del" aria-label={`Delete tag ${t}`}
                    onClick={(e) => { e.stopPropagation(); store.remove(t); setTags((c) => c.filter((x) => x !== t)); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); store.remove(t); } }}>
                    <X size={12} />
                  </span>
                </button>
              ))}
            </div>
          )}
        <div className="tag-add-row">
          <Input value={newTag} onChange={(e) => setNewTag(e.target.value)}
            placeholder="New tag" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNewTag(); } }} />
          <Button size="sm" variant="outline" onClick={addNewTag} aria-label="Add tag"><Plus size={15} /></Button>
        </div>
      </Field>

      <HomeVisibility
        value={home}
        onChange={setHome}
        autoHint="Links don't otherwise appear on the Dashboard — pin one to keep it handy."
      />

      {!isNew && (
        <Button variant="danger" size="sm" onClick={() => { repo.softDelete(existing.id); onClose(); }}>
          <Trash2 size={14} /> Delete link
        </Button>
      )}
    </Sheet>
  );
}

/* -------------------------------- screen -------------------------------- */

export function LinksScreen() {
  const repo = useRepo();
  const [searchParams] = useSearchParams();
  const [editing, setEditing] = useState(undefined);
  const [activeTag, setActiveTag] = useState('');
  const [copied, setCopied] = useState(null);

  const store = useTagStore();
  const all = repo.query({ type: TYPE }).slice().reverse();
  const links = activeTag ? all.filter((l) => l.tags.includes(activeTag)) : all;

  // Open a specific link's editor when arriving from global search (?open=ID).
  const consumedOpen = useRef(null);
  const openId = searchParams.get('open');
  useEffect(() => {
    if (openId && consumedOpen.current !== openId) {
      consumedOpen.current = openId;
      const link = all.find((l) => l.id === openId);
      if (link) setEditing(link);
    }
  }, [openId, all]);

  const copy = async (link) => {
    try {
      await navigator.clipboard.writeText(link.data.url);
      setCopied(link.id);
      setTimeout(() => setCopied(null), 1400);
    } catch { /* clipboard blocked */ }
  };

  return (
    <div className="page has-fab">
      <div className="page-head">
        <div>
          <h1 className="page-title serif">Links</h1>
          <p className="page-sub">Videos, articles, addresses — things worth coming back to.</p>
        </div>
      </div>

      {store.tags.length > 0 && (
        <div className="link-filter-bar">
          <button className={`link-tag-pill ${activeTag === '' ? 'is-active' : ''}`} onClick={() => setActiveTag('')}>All</button>
          {store.tags.map((t) => (
            <button key={t} className={`link-tag-pill ${activeTag === t ? 'is-active' : ''}`} onClick={() => setActiveTag(activeTag === t ? '' : t)}>{t}</button>
          ))}
        </div>
      )}

      <SectionLabel right={<span className="mono count">{links.length}</span>}>
        {activeTag ? `Tagged “${activeTag}”` : 'Saved'}
      </SectionLabel>

      {links.length === 0 ? (
        <Card>
          <EmptyState icon={Link2}
            title={activeTag ? 'Nothing with this tag' : 'No links yet'}
            body="Save a video, an article, or any address you want to find again."
            action={<Button variant="outline" size="sm" onClick={() => setEditing(null)}>Save one</Button>} />
        </Card>
      ) : (
        <Card>
          <div className="ruled">
            {links.map((l) => (
              <Row key={l.id}
                accent="var(--accent-links)"
                href={normalizeUrl(l.data.url)}
                target="_blank"
                rel="noreferrer"
                title={
                  <span className="link-row-main">
                    <span className="link-title">{l.title}</span>
                    <span className="link-url">{prettyUrl(l.data.url)}</span>
                    {l.data.desc && <span className="link-desc">{l.data.desc}</span>}
                    {l.tags.length > 0 && (
                      <span className="link-tags">
                        {l.tags.map((t) => <Chip key={t} tone="neutral">{t}</Chip>)}
                      </span>
                    )}
                  </span>
                }
                right={
                  <span style={{ display: 'flex', gap: 2 }}>
                    <button type="button" className="icon-btn" aria-label="Copy link"
                      onClick={(e) => { e.stopPropagation(); copy(l); }}>
                      {copied === l.id ? <Check size={15} /> : <Copy size={15} />}
                    </button>
                    <button type="button" className="icon-btn" aria-label="Edit link"
                      onClick={(e) => { e.stopPropagation(); setEditing(l); }}>
                      <Pencil size={15} />
                    </button>
                  </span>
                }
              />
            ))}
          </div>
        </Card>
      )}

      {editing !== undefined && <LinkSheet existing={editing || undefined} onClose={() => setEditing(undefined)} />}
      <Fab label="Save link" onClick={() => setEditing(null)} />
    </div>
  );
}

/* ------------------------------ dashboard ------------------------------- */

// Links have no due date — they only ever appear on the Dashboard's pinned
// board, and only once actually pinned (there's no "auto" rule for them).
registerProvider({
  id: 'links',
  getItemsForDate: () => [],
  getPinnedItems: (repo) => repo.query({ type: TYPE })
    .filter((l) => l.home === 'pinned')
    .map((l) => ({
      id: l.id, title: l.title, type: 'links',
      dueDate: null, pinned: true, completed: false, completedAt: null,
      record: l,
    })),
  togglePin: (repo, item) => repo.update(item.id, { home: item.pinned ? 'auto' : 'pinned' }),
});

/* ------------------------------- manifest ------------------------------ */

export default {
  id: 'links',
  title: 'Links',
  icon: Link2,
  accent: 'var(--accent-links)',
  tier: 'integrated',
  routes: [{ path: '/links', element: <LinksScreen /> }],
  today: () => [],
  renderRef: (record) => <span className="ref-chip">{record.title}</span>,
  search: ({ repo }, q) =>
    repo.query({ type: TYPE })
      .filter((l) =>
        l.title.toLowerCase().includes(q) ||
        (l.data.url || '').toLowerCase().includes(q) ||
        (l.data.desc || '').toLowerCase().includes(q) ||
        l.tags.some((t) => t.toLowerCase().includes(q)))
      .map((l) => ({ id: l.id, title: l.title, sub: prettyUrl(l.data.url), to: `/links?open=${l.id}` })),
  quickActions: [{ id: 'new-link', label: 'Save link', icon: Link2, to: '/links' }],
};
