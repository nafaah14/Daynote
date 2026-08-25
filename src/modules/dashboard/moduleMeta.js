import { BellRing, ListChecks, HandCoins, StickyNote, Link2 } from 'lucide-react';

/**
 * Icon/accent/label per provider id, for chips and rows here in Dashboard.
 * Deliberately a small local copy of what each module's own manifest
 * already declares in src/registry.js, rather than importing that registry
 * — Dashboard is itself one of the modules registry.js assembles, so
 * importing it back here would be a real import cycle (registry.js →
 * dashboard/index.jsx → ... → registry.js).
 */
export const MODULE_META = {
  reminders: { icon: BellRing, accent: 'var(--accent-reminders)', label: 'Reminders' },
  lists: { icon: ListChecks, accent: 'var(--accent-lists)', label: 'Lists' },
  payments: { icon: HandCoins, accent: 'var(--accent-loans)', label: 'Payments' },
  notes: { icon: StickyNote, accent: 'var(--accent-notes)', label: 'Notes' },
  links: { icon: Link2, accent: 'var(--accent-links)', label: 'Links' },
};
