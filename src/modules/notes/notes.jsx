import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  StickyNote, Trash2, Bold, Italic, Underline, List as ListIcon,
  Pin, PinOff, Copy, Check, X, Palette, Baseline, MoreHorizontal, Undo2,
  GripVertical, ArrowUp, ArrowDown, Save,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useRepo } from '../../core/db/repo';
import { Card, SectionLabel, EmptyState, Button, useBackClose } from '../../core/ui/components';
import { Fab } from '../../core/ui/extras';
import { dueLabel } from '../../core/dates';

export const TYPE = 'notes.note';

// dark values are hand-picked against the navy theme (see tokens.css's
// [data-theme="dark"] --card/--paper) — they're fixed hex, not CSS vars, so
// a theme repaint doesn't touch them automatically. 'plain' matches --card
// exactly; the rest are tinted a step off it, saturated enough to still
// read as their color against a navy (not neutral-black) base.
export const COLORS = [
  { id: 'plain',  light: ['#FFFFFF', '#E8EBEF'], dark: ['#242A5E', '#333B7E'] },
  { id: 'amber',  light: ['#FDF3DC', '#EBDCB4'], dark: ['#3A2E1A', '#54432A'] },
  { id: 'sage',   light: ['#E6F0E8', '#C8DCCC'], dark: ['#17301F', '#22452F'] },
  { id: 'sky',    light: ['#E4EEF7', '#C3D8EA'], dark: ['#17304A', '#20456A'] },
  { id: 'rose',   light: ['#FBE7E3', '#EDC9C1'], dark: ['#3A1E2E', '#552B44'] },
  { id: 'violet', light: ['#EDE8F6', '#D3C9E6'], dark: ['#2A1E4A', '#3D2C68'] },
];

const paletteFor = (id, theme) => {
  const c = COLORS.find((x) => x.id === id) || COLORS[0];
  return theme === 'dark' ? c.dark : c.light;
};

const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR', 'DIV', 'P', 'UL', 'OL', 'LI', 'SPAN']);
const DROP = new Set([
  'SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META',
  'NOSCRIPT', 'TEMPLATE', 'SVG', 'MATH', 'FORM', 'INPUT', 'BUTTON',
]);
const SAFE_STYLE_PROPS = new Set(['color', 'font-size', 'list-style-type']);
const SAFE_STYLE_VALUE = /^[#a-z0-9(),.\s%-]+$/i;

function keepSafeStyleOnly(el) {
  const raw = el.getAttribute('style') || '';
  [...el.attributes].forEach((a) => el.removeAttribute(a.name));
  const kept = raw.split(';').map((d) => d.trim()).filter(Boolean)
    .map((d) => { const i = d.indexOf(':'); return i < 0 ? null : [d.slice(0, i).trim().toLowerCase(), d.slice(i + 1).trim()]; })
    .filter(Boolean)
    .filter(([k, v]) => SAFE_STYLE_PROPS.has(k) && SAFE_STYLE_VALUE.test(v) && !/url|expression|javascript/i.test(v));
  if (kept.length) el.setAttribute('style', kept.map(([k, v]) => `${k}: ${v}`).join('; '));
}

export function sanitize(html) {
  const host = document.createElement('div');
  host.innerHTML = html || '';
  host.querySelectorAll('font').forEach((f) => {
    const span = document.createElement('span');
    const color = f.getAttribute('color');
    const size = f.getAttribute('size');
    if (color) span.style.color = color;
    if (size) span.style.fontSize = ({ 1: 'x-small', 2: 'small', 3: 'medium', 4: 'large', 5: 'x-large', 6: 'xx-large', 7: 'xx-large' })[size] || '';
    span.innerHTML = f.innerHTML;
    f.replaceWith(span);
  });
  const walk = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === 3) return;
      if (child.nodeType !== 1) { child.remove(); return; }
      if (DROP.has(child.tagName)) { child.remove(); return; }
      if (!ALLOWED.has(child.tagName)) { child.replaceWith(...child.childNodes); return; }
      keepSafeStyleOnly(child);
      walk(child);
    });
  };
  walk(host);
  return host.innerHTML;
}

export async function copyNote(note, onDone) {
  const text = [note.title, htmlToText(note.data?.html)].filter(Boolean).join('\n\n');
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
    else {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    onDone?.(note.id);
    setTimeout(() => onDone?.(null), 1400);
  } catch { /* clipboard blocked */ }
}

/**
 * Flattened to one line — for the note's title fallback and its stored
 * search-index text (data.preview), neither of which wants embedded line
 * breaks. `textContent` doesn't insert anything at block/<br> boundaries
 * (`<div>A</div><div>B</div>` reads as "AB"), which is exactly right here:
 * there's nothing to preserve. Do not use this where line breaks matter —
 * see htmlToText below for that.
 */
export const plainText = (html) => {
  const d = document.createElement('div');
  d.innerHTML = html || '';
  return (d.textContent || '').replace(/\s+/g, ' ').trim();
};

const TEXT_BLOCK_TAGS = new Set(['DIV', 'P', 'LI']);

/**
 * Line-break-preserving text extraction — for anywhere the note's actual
 * line structure needs to survive (copy-to-clipboard, the grid preview).
 * `textContent`/`plainText` above collapse block boundaries entirely, which
 * is why copy and preview were losing line breaks the editor itself never
 * lost — this walks the DOM and turns <br> and block-element edges into \n
 * instead of dropping them.
 */
export function htmlToText(html) {
  const host = document.createElement('div');
  host.innerHTML = html || '';
  let text = '';
  const ensureNewline = () => {
    if (text.length > 0 && !text.endsWith('\n')) text += '\n';
  };
  const walk = (node) => {
    if (node.nodeType === 3) { text += node.nodeValue; return; }
    if (node.nodeType !== 1) return;
    if (node.tagName === 'BR') { text += '\n'; return; }
    const isBlock = TEXT_BLOCK_TAGS.has(node.tagName);
    if (isBlock) ensureNewline();
    node.childNodes.forEach(walk);
    if (isBlock) ensureNewline();
  };
  host.childNodes.forEach(walk);
  // A trailing empty block (e.g. <div><br></div>) can pile up more than one
  // blank line — cap it at one, and drop leading/trailing blank lines.
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

export const TEXT_COLORS = [
  { name: 'Red',    hex: '#D9534F' },
  { name: 'Orange', hex: '#E08A3C' },
  { name: 'Green',  hex: '#4E9A62' },
  { name: 'Blue',   hex: '#4A90D9' },
  { name: 'Purple', hex: '#9B7FD4' },
  { name: 'Grey',   hex: '#8A94A6' },
];

export const TEXT_SIZES = [
  { id: 'sm', label: 'Small',  cmd: '2', preview: '11px' },
  { id: 'md', label: 'Normal', cmd: '3', preview: '14px' },
  { id: 'lg', label: 'Large',  cmd: '5', preview: '18px' },
];

export const LIST_STYLES = [
  { id: 'disc',        label: 'Bulleted', ordered: false, css: 'disc',        glyph: '•' },
  { id: 'circle',      label: 'Circles',  ordered: false, css: 'circle',      glyph: '○' },
  { id: 'square',      label: 'Squares',  ordered: false, css: 'square',      glyph: '▪' },
  { id: 'decimal',     label: 'Numbered', ordered: true,  css: 'decimal',     glyph: '1.' },
  { id: 'lower-alpha', label: 'Lettered', ordered: true,  css: 'lower-alpha', glyph: 'a.' },
];

/* ------------------------------- popover -------------------------------- */

function Popover({ icon: Icon, label, align = 'right', preserveSelection, children }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const guard = preserveSelection ? { onMouseDown: (e) => e.preventDefault() } : {};

  return (
    <div className="rt-pop-wrap" ref={wrapRef}>
      <button type="button" className={`rt-btn ${open ? 'is-on' : ''}`}
        aria-label={label} title={label} {...guard} onClick={() => setOpen((o) => !o)}>
        <Icon size={16} />
      </button>
      {open && (
        <div className={`rt-pop rt-pop-${align}`} {...guard}>
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  );
}

/* ------------------------------- editor -------------------------------- */

export const renderEditor = (record, close) => (
  <NoteSheet existing={record || undefined} onClose={close} />
);

const HOME_CHOICES = [
  { id: 'auto',   label: 'Auto — on Today when it needs attention' },
  { id: 'pinned', label: 'Always on Today' },
  { id: 'hidden', label: 'Never on Today' },
];

/** Auto-save interval (ms). */
const AUTOSAVE_DELAY = 3000;

export function NoteSheet({ existing, onClose }) {
  const repo = useRepo();
  const isNew = !existing;
  const ref = useRef(null);
  const [title, setTitle] = useState(existing?.title || '');
  const [color, setColor] = useState(existing?.data?.color || 'plain');
  const [home, setHome] = useState(existing?.home || 'auto');
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const theme = document.documentElement.getAttribute('data-theme') || 'light';

  const recordIdRef = useRef(existing?.id || null);
  const autoSaveTimer = useRef(null);
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (ref.current) ref.current.innerHTML = sanitize(existing?.data?.html || '');
  }, [existing]);

  const exec = (cmd, value = null) => {
    ref.current?.focus();
    try { document.execCommand('styleWithCSS', false, true); } catch { /* older engines */ }
    document.execCommand(cmd, false, value);
  };

  const applyList = (style) => {
    exec(style.ordered ? 'insertOrderedList' : 'insertUnorderedList');
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    let node = sel.getRangeAt(0).startContainer;
    if (node.nodeType === 3) node = node.parentElement;
    const listEl = node?.closest?.('ul, ol');
    if (listEl) listEl.style.listStyleType = style.css;
  };

  /**
   * Markdown-style autoformat: typing "1. " (or "1) ") or "- "/"* " converts
   * the line into a real numbered/bulleted list item, matching the toolbar's
   * own default style for each kind — same mechanism as clicking a list
   * style in the toolbar, just triggered by what was typed instead of a
   * click. Only fires when the marker is literally everything on the line
   * before the cursor, so "point 1. " mid-sentence is left alone.
   */
  const maybeAutoformatList = () => {
    const sel = window.getSelection();
    if (!sel || !sel.isCollapsed || !sel.rangeCount) return;
    const cursor = sel.getRangeAt(0);
    const container = cursor.startContainer;
    if (container.nodeType !== Node.TEXT_NODE) return;

    let lineEl = container.parentElement;
    while (lineEl && lineEl !== ref.current && lineEl.tagName !== 'DIV' && lineEl.tagName !== 'P') {
      lineEl = lineEl.parentElement;
    }
    if (!lineEl) return;

    const preRange = document.createRange();
    preRange.setStart(lineEl, 0);
    preRange.setEnd(container, cursor.startOffset);
    const soFar = preRange.toString();

    const ordered = /^\d+[.)] $/.test(soFar);
    const bulleted = !ordered && /^[-*] $/.test(soFar);
    if (!ordered && !bulleted) return;

    // Undo note: this clears the typed marker via a direct DOM range delete
    // (not execCommand), so it isn't tracked on the browser's own undo stack
    // the same way the list conversion is — Ctrl+Z afterward undoes the list
    // conversion but won't separately restore the deleted marker text.
    preRange.deleteContents();
    applyList(LIST_STYLES.find((s) => s.ordered === ordered));
  };

  /** Core persist. Creates or updates. Returns the record id. */
  const persist = useCallback(() => {
    const html = sanitize(ref.current?.innerHTML || '');
    const body = plainText(html);
    const t = title.trim() || body.slice(0, 60) || 'Untitled note';
    if (!t && !body) return null;
    const payload = {
      title: t,
      home,
      data: { html, color, preview: body.slice(0, 200) },
    };
    if (recordIdRef.current) {
      repo.update(recordIdRef.current, payload);
    } else {
      const rec = repo.create(TYPE, payload);
      recordIdRef.current = rec.id;
    }
    dirtyRef.current = false;
    return recordIdRef.current;
  }, [title, home, color, repo]);

  const save = useCallback(() => {
    clearTimeout(autoSaveTimer.current);
    persist();
    onClose();
  }, [persist, onClose]);

  /** Schedule a quiet auto-save after AUTOSAVE_DELAY ms. */
  const scheduleSave = useCallback(() => {
    dirtyRef.current = true;
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      if (dirtyRef.current) {
        persist();
        setSaved(true);
        setTimeout(() => setSaved(false), 1200);
      }
    }, AUTOSAVE_DELAY);
  }, [persist]);

  useEffect(() => { scheduleSave(); }, [title, color, home, scheduleSave]);

  // Flush on unmount
  useEffect(() => {
    return () => {
      clearTimeout(autoSaveTimer.current);
      if (dirtyRef.current) {
        const html = sanitize(ref.current?.innerHTML || '');
        const body = plainText(html);
        const t = title.trim() || body.slice(0, 60) || 'Untitled note';
        if (t || body) {
          const payload = {
            title: t || 'Untitled note',
            home,
            data: { html, color, preview: body.slice(0, 200) },
          };
          if (recordIdRef.current) repo.update(recordIdRef.current, payload);
          else repo.create(TYPE, payload);
        }
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useBackClose(save);

  const remove = () => {
    clearTimeout(autoSaveTimer.current);
    dirtyRef.current = false;
    if (recordIdRef.current) repo.softDelete(recordIdRef.current);
    onClose();
  };

  const [bg] = paletteFor(color, theme);

  return (
    <div className="note-editor-scrim" style={{ background: bg }}>
      {/* ---- top bar: close + save + actions ---- */}
      <div className="note-editor-top">
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          <X size={19} />
        </button>
        <div className="note-editor-top-right">
          {saved && <span className="note-autosaved">Saved</span>}
          <button type="button" className="note-save-top" onClick={save} aria-label="Save">
            <Check size={18} strokeWidth={2.5} />
            <span>Save</span>
          </button>
          <Popover icon={home === 'hidden' ? PinOff : Pin} label="Show on Today" align="right">
            {(close) => (
              <div className="rt-menu">
                {HOME_CHOICES.map((c) => (
                  <button key={c.id} type="button"
                    className={`rt-menu-item ${home === c.id ? 'is-on' : ''}`}
                    onClick={() => { setHome(c.id); close(); }}>
                    {c.label}
                  </button>
                ))}
              </div>
            )}
          </Popover>
          <Popover icon={Palette} label="Note colour" align="right">
            <div className="swatch-row rt-pop-swatches">
              {COLORS.map((c) => {
                const [swBg, swEdge] = paletteFor(c.id, theme);
                return (
                  <button key={c.id} type="button" aria-label={c.id}
                    className={`swatch-btn ${color === c.id ? 'is-on' : ''}`}
                    style={{ background: swBg, borderColor: color === c.id ? 'var(--ink)' : swEdge }}
                    onClick={() => setColor(c.id)} />
                );
              })}
            </div>
          </Popover>
          {!isNew && (
            <Popover icon={MoreHorizontal} label="More" align="right">
              {(close) => (
                <div className="rt-menu">
                  <button type="button" className="rt-menu-item" onClick={() => { copyNote(existing, setCopied); close(); }}>
                    <Copy size={13} /> {copied ? 'Copied' : 'Copy'}
                  </button>
                  <button type="button" className="rt-menu-item rt-menu-danger" onClick={remove}>
                    <Trash2 size={13} /> Delete note
                  </button>
                </div>
              )}
            </Popover>
          )}
        </div>
      </div>

      {/* ---- formatting toolbar ---- */}
      <div className="note-editor-toolbar">
        <button type="button" className="rt-btn" onMouseDown={(e) => e.preventDefault()}
          onClick={() => document.execCommand('undo')} aria-label="Undo" title="Undo">
          <Undo2 size={15} />
        </button>
        <span className="rt-sep" />
        <div className="rt-group">
          <button type="button" className="rt-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('bold')} aria-label="Bold"><Bold size={15} /></button>
          <button type="button" className="rt-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('italic')} aria-label="Italic"><Italic size={15} /></button>
          <button type="button" className="rt-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('underline')} aria-label="Underline"><Underline size={15} /></button>
        </div>
        <span className="rt-sep" />
        <Popover icon={ListIcon} label="List style" align="left" preserveSelection>
          {(close) => (
            <div className="rt-menu">
              {LIST_STYLES.map((s) => (
                <button key={s.id} type="button" className="rt-menu-item"
                  onMouseDown={(e) => e.preventDefault()} onClick={() => { applyList(s); close(); }}>
                  <span className="rt-menu-glyph mono">{s.glyph}</span> {s.label}
                </button>
              ))}
            </div>
          )}
        </Popover>
        <span className="rt-sep" />
        <Popover icon={AaGlyph} label="Text size" align="left" preserveSelection>
          {(close) => (
            <div className="rt-menu">
              {TEXT_SIZES.map((sz) => (
                <button key={sz.id} type="button" className="rt-menu-item"
                  style={{ fontSize: sz.preview }}
                  onMouseDown={(e) => e.preventDefault()} onClick={() => { exec('fontSize', sz.cmd); close(); }}>
                  {sz.label}
                </button>
              ))}
            </div>
          )}
        </Popover>
        <span className="rt-sep" />
        <Popover icon={Baseline} label="Text colour" align="right" preserveSelection>
          <div className="swatch-row rt-pop-swatches">
            {TEXT_COLORS.map((c) => (
              <button key={c.hex} type="button" className="rt-swatch"
                style={{ background: c.hex }} onMouseDown={(e) => e.preventDefault()}
                onClick={() => exec('foreColor', c.hex)} aria-label={`${c.name} text`} title={`${c.name} text`} />
            ))}
          </div>
        </Popover>
      </div>

      {/* ---- writing area ---- */}
      <div className="note-editor-scroll">
        <input className="note-editor-title" value={title}
          onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
        <div ref={ref} className="note-editor-body" contentEditable
          suppressContentEditableWarning role="textbox" aria-multiline="true"
          data-placeholder="Write anything…"
          onInput={() => { maybeAutoformatList(); scheduleSave(); }} />
      </div>
    </div>
  );
}

function AaGlyph({ size, ...rest }) {
  return <span {...rest} style={{ fontWeight: 700, fontSize: 13, lineHeight: 1 }}>Aa</span>;
}

/**
 * One grid card. The preview text is derived live from data.html (not the
 * stored data.preview, which stays flattened for search — see plainText's
 * docstring) so every note's card reflects its real line breaks without
 * needing any of the app's existing notes touched or migrated.
 */
function NoteTile({ note, theme, copied, onOpen, onCopy }) {
  const [bg, edge] = paletteFor(note.data.color, theme);
  const preview = useMemo(() => htmlToText(note.data.html), [note.data.html]);
  return (
    <button className="note-tile" style={{ '--note-bg': bg, '--note-edge': edge }} onClick={onOpen}>
      <span className="note-title">{note.title}</span>
      <span className="note-preview">{preview}</span>
      <span className="note-foot">
        <span>{dueLabel(note.updatedAt)}</span>
        <span className="note-foot-icons">{note.home === 'pinned' && <Pin size={11} />}</span>
      </span>
      <span role="button" tabIndex={0} className="note-copy" aria-label={`Copy ${note.title}`}
        title="Copy note"
        onClick={(e) => { e.stopPropagation(); onCopy(); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onCopy(); } }}>
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </span>
    </button>
  );
}

/* -------------------------------- screen ------------------------------- */

const ORDER_KEY = 'daybook.notes.order';
function loadOrder() {
  try { return JSON.parse(localStorage.getItem(ORDER_KEY) || '[]'); }
  catch { return []; }
}
function saveOrder(ids) {
  try { localStorage.setItem(ORDER_KEY, JSON.stringify(ids)); } catch { /* quota */ }
}
function sortByOrder(notes) {
  const order = loadOrder();
  if (!order.length) return notes;
  const map = new Map(notes.map((n) => [n.id, n]));
  const sorted = [];
  for (const id of order) {
    const n = map.get(id);
    if (n) { sorted.push(n); map.delete(id); }
  }
  // New notes go at the top
  return [...map.values(), ...sorted];
}

export function NotesScreen() {
  const repo = useRepo();
  const [searchParams] = useSearchParams();
  const [editing, setEditing] = useState(undefined);
  const [copied, setCopied] = useState(null);
  const [reordering, setReordering] = useState(false);
  const theme = document.documentElement.getAttribute('data-theme') || 'light';

  const allNotes = repo.query({ type: TYPE }).slice().reverse();
  const notes = useMemo(() => sortByOrder(allNotes), [allNotes]);

  const consumedOpen = useRef(null);
  const openId = searchParams.get('open');
  useEffect(() => {
    if (openId && consumedOpen.current !== openId) {
      consumedOpen.current = openId;
      const note = notes.find((n) => n.id === openId);
      if (note) setEditing(note);
    }
  }, [openId, notes]);

  /* ---- reorder via up/down buttons ---- */
  const moveNote = (id, dir) => {
    const order = notes.map((n) => n.id);
    const i = order.indexOf(id);
    if (i < 0) return;
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    saveOrder(order);
    // Force re-render
    setReordering((r) => r); // no-op but triggers useMemo recalc next render
  };

  return (
    <div className="page has-fab">
      <div className="page-head">
        <div>
          <h1 className="page-title serif">Notes</h1>
          <p className="page-sub">Anything worth keeping but not worth chasing.</p>
        </div>
        {notes.length > 1 && (
          <Button size="sm" variant={reordering ? 'primary' : 'outline'}
            onClick={() => setReordering((r) => !r)}>
            {reordering ? 'Done' : 'Reorder'}
          </Button>
        )}
      </div>

      <SectionLabel right={<span className="mono count">{notes.length}</span>}>All notes</SectionLabel>

      {notes.length === 0 ? (
        <Card>
          <EmptyState icon={StickyNote} title="No notes yet"
            body="Somewhere for the things that aren't tasks and aren't lists."
            action={<Button variant="outline" size="sm" onClick={() => setEditing(null)}>Write one</Button>} />
        </Card>
      ) : reordering ? (
        /* ---- reorder mode: single-column list ---- */
        <Card>
          <div className="ruled">
            {notes.map((n, idx) => {
              const [bg] = paletteFor(n.data.color, theme);
              return (
                <div key={n.id} className="note-reorder-row">
                  <span className="note-reorder-swatch" style={{ background: bg }} />
                  <span className="note-reorder-title">{n.title}</span>
                  <span className="note-reorder-btns">
                    <button className="icon-btn" disabled={idx === 0}
                      onClick={() => moveNote(n.id, -1)} aria-label="Move up">
                      <ArrowUp size={16} />
                    </button>
                    <button className="icon-btn" disabled={idx === notes.length - 1}
                      onClick={() => moveNote(n.id, 1)} aria-label="Move down">
                      <ArrowDown size={16} />
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      ) : (
        /* ---- normal mode: tile grid ---- */
        <div className="note-grid">
          {notes.map((n) => (
            <NoteTile key={n.id} note={n} theme={theme}
              copied={copied === n.id}
              onOpen={() => setEditing(n)}
              onCopy={() => copyNote(n, setCopied)} />
          ))}
        </div>
      )}

      {editing !== undefined && (
        <NoteSheet existing={editing || undefined} onClose={() => setEditing(undefined)} />
      )}

      <Fab label="New note" onClick={() => setEditing(null)} />
    </div>
  );
}

/* ------------------------------- manifest ------------------------------ */

export default {
  id: 'notes',
  title: 'Notes',
  icon: StickyNote,
  accent: 'var(--accent-notes)',
  tier: 'integrated',
  routes: [{ path: '/notes', element: <NotesScreen /> }],
  today: ({ repo }) => {
    const pinned = repo.query({ type: TYPE }).filter((n) => n.home === 'pinned');
    if (!pinned.length) return [];
    return [{
      id: 'notes-pinned', priority: 60, label: 'Notes', records: pinned,
      render: (n) => (
        <div className="note-today-row">
          <span className="note-today-swatch" data-color={n.data?.color || 'plain'} />
          <span className="note-today-body">
            <span className="note-today-title">{n.title}</span>
            {n.data?.preview && <span className="note-today-preview">{n.data.preview}</span>}
          </span>
        </div>
      ),
    }];
  },
  renderRef: (record) => <span className="ref-chip">{record.title}</span>,
  search: ({ repo }, q) =>
    repo.query({ type: TYPE })
      .filter((n) => n.title.toLowerCase().includes(q) || (n.data.preview || '').toLowerCase().includes(q))
      .map((n) => ({ id: n.id, title: n.title, sub: 'Note', to: `/notes?open=${n.id}` })),
  quickActions: [{ id: 'new-note', label: 'New note', icon: StickyNote, to: '/notes' }],
};
