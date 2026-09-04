import { useState } from 'react';
import {
  Plus, X, BellRing, ListChecks, Package, Contact, Link2, HandCoins, Lightbulb,
} from 'lucide-react';
import { useEditors } from '../../core/ui/editors';
import { providerFor } from '../../core/dashboardRegistry';

/**
 * Keep-style expanding quick-add. Reminder/List/Stock/Person/Link all go
 * through the shared editor host's openNew (registry-editors.jsx) — the
 * same blank-form path every module already uses elsewhere in the app.
 * Payment is the odd one out: there's no single blank form for "log a
 * receipt," since a receipt always belongs to one specific, already-
 * existing payment item — so it runs the payments provider's own
 * renderQuickAdd instead (a small item picker, then that item's own
 * PaymentSheet), kept inside payments.jsx rather than built here so
 * Dashboard never needs to import from another module directly.
 */
const ACTIONS = [
  { id: 'reminders', label: 'Reminder', icon: BellRing, accent: 'var(--accent-reminders)' },
  { id: 'ideas', label: 'Idea', icon: Lightbulb, accent: 'var(--accent-ideas)' },
  { id: 'lists', label: 'List', icon: ListChecks, accent: 'var(--accent-lists)' },
  { id: 'stock', label: 'Stock', icon: Package, accent: 'var(--accent-stock)' },
  { id: 'directory', label: 'Person', icon: Contact, accent: 'var(--accent-notes)' },
  { id: 'links', label: 'Link', icon: Link2, accent: 'var(--accent-links)' },
  { id: 'payments', label: 'Payment', icon: HandCoins, accent: 'var(--accent-loans)', quickAdd: true },
];

export function QuickAddFab() {
  const [open, setOpen] = useState(false);
  const [quickAddNode, setQuickAddNode] = useState(null);
  const { openNew } = useEditors();

  const run = (action) => {
    setOpen(false);
    if (action.quickAdd) {
      const provider = providerFor(action.id);
      const close = () => setQuickAddNode(null);
      setQuickAddNode(provider?.renderQuickAdd ? provider.renderQuickAdd(close) : null);
    } else {
      openNew(action.id);
    }
  };

  return (
    <>
      {open && <div className="dash-fab-scrim" onClick={() => setOpen(false)} />}
      {open && (
        <div className="dash-fab-actions">
          {ACTIONS.map((a) => (
            <button type="button" key={a.id} className="dash-fab-action" onClick={() => run(a)}>
              <span className="dash-fab-action-label">{a.label}</span>
              <span className="dash-fab-action-icon" style={{ background: a.accent }}>
                <a.icon size={18} strokeWidth={2} />
              </span>
            </button>
          ))}
        </div>
      )}
      <button
        type="button" className={`fab dash-fab-main ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((v) => !v)} aria-label={open ? 'Close quick add' : 'Quick add'}
      >
        {open ? <X size={22} strokeWidth={2.2} /> : <Plus size={24} strokeWidth={2.2} />}
      </button>
      {quickAddNode}
    </>
  );
}
