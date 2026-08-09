import { useRef, useEffect, useCallback, memo } from 'react';
import { Bold, Italic, Underline, List, ListOrdered } from 'lucide-react';

const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR', 'DIV', 'P', 'UL', 'OL', 'LI', 'SPAN']);
const DROP = new Set([
  'SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META',
  'NOSCRIPT', 'TEMPLATE', 'SVG', 'MATH', 'FORM', 'INPUT', 'BUTTON',
]);

function sanitizeRich(html) {
  const host = document.createElement('div');
  host.innerHTML = html || '';
  const walk = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === 3) return;
      if (child.nodeType !== 1) { child.remove(); return; }
      if (DROP.has(child.tagName)) { child.remove(); return; }
      if (!ALLOWED.has(child.tagName)) { child.replaceWith(...child.childNodes); return; }
      [...child.attributes].forEach((a) => child.removeAttribute(a.name));
      walk(child);
    });
  };
  walk(host);
  return host.innerHTML;
}

/**
 * The actual contentEditable div — rendered via a ref-managed DOM node that
 * React never tries to reconcile. This is the only safe way to combine
 * contentEditable with React: if React ever re-renders a component whose
 * DOM has been modified by the browser (typing, formatting, lists), it
 * crashes with "removeChild: The node to be removed is not a child of this
 * node" because the virtual DOM no longer matches reality.
 *
 * By creating the editable div imperatively and appending it to a ref'd
 * wrapper, React sees only the empty wrapper and never touches what's
 * inside it.
 */
const EditableArea = memo(function EditableArea({ initialHtml, placeholder, onCommit }) {
  const wrapRef = useRef(null);
  const editRef = useRef(null);
  const lastSaved = useRef(initialHtml || '');

  useEffect(() => {
    if (!wrapRef.current || editRef.current) return;

    // Create the editable div imperatively — React never owns it
    const div = document.createElement('div');
    div.className = 'rich-editable';
    div.contentEditable = 'true';
    div.setAttribute('role', 'textbox');
    div.setAttribute('aria-multiline', 'true');
    if (placeholder) div.setAttribute('data-placeholder', placeholder);
    div.innerHTML = initialHtml || '';

    div.addEventListener('blur', () => {
      const html = sanitizeRich(div.innerHTML);
      if (html !== lastSaved.current) {
        lastSaved.current = html;
        onCommit(html);
      }
    });

    wrapRef.current.appendChild(div);
    editRef.current = div;

    return () => {
      // Cleanup: remove the div we created
      if (editRef.current && editRef.current.parentNode) {
        editRef.current.parentNode.removeChild(editRef.current);
      }
      editRef.current = null;
    };
  }, []); // Mount once, never re-run

  return <div ref={wrapRef} className="rich-field-body" />;
}, () => true); // Never re-render — the editable div manages its own state

/**
 * Rich text field with toolbar. The toolbar is a normal React component;
 * the editable area is imperatively managed (see EditableArea above).
 */
export function RichField({ value, onChange, placeholder }) {
  const editableRef = useRef(null);

  // We need a stable ref to the wrapper so the toolbar can call execCommand
  // on the right element (focus it first).
  const focusEditable = useCallback(() => {
    const el = editableRef.current?.querySelector('.rich-editable');
    if (el) el.focus();
  }, []);

  const exec = useCallback((cmd) => {
    focusEditable();
    try { document.execCommand('styleWithCSS', false, true); } catch { /* ok */ }
    document.execCommand(cmd, false, null);
  }, [focusEditable]);

  return (
    <div className="rich-field-wrap" ref={editableRef}>
      <div className="rich-toolbar">
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('bold')} title="Bold" className="rich-tb-btn"><Bold size={14} /></button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('italic')} title="Italic" className="rich-tb-btn"><Italic size={14} /></button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('underline')} title="Underline" className="rich-tb-btn"><Underline size={14} /></button>
        <span className="rich-tb-sep" />
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('insertUnorderedList')} title="Bullet list" className="rich-tb-btn"><List size={14} /></button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('insertOrderedList')} title="Numbered list" className="rich-tb-btn"><ListOrdered size={14} /></button>
      </div>
      <EditableArea initialHtml={value} placeholder={placeholder} onCommit={onChange} />
    </div>
  );
}
