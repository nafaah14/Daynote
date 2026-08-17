import { Clapperboard } from 'lucide-react';
import { Card, EmptyState, Button } from '../core/ui/components';

/**
 * TIER 2 — hosted apps.
 *
 * These share the shell: auth, navigation, the design system, the launcher.
 * They do NOT share the record envelope. Spaced-repetition scheduling has
 * nothing to do with dueAt/tags/title, and forcing it in would wreck both.
 *
 * The contract is just { id, title, icon, route }. Everything else is opt-in:
 * a hosted app can add today() later to surface "12 cards due" on the home
 * screen without ever adopting the envelope. It joins the integrated tier one
 * function at a time, if it ever wants to.
 *
 * IMPORTANT: when a hosted placeholder graduates to a real integrated module
 * (Directory and Mandarin both did), remove its stub from here. Leaving both
 * around gives two entries with the same id — one real, one dead — and
 * registry.js has no way to know which is which. That's what happened with
 * Directory: this file still listed a placeholder for it after the real
 * module existed, which duplicated 'directory' across the integrated and
 * hosted lists and broke every screen that iterates over modules.
 */

function Placeholder({ name, note }) {
  return (
    <div className="page">
      <h1 className="page-title serif">{name}</h1>
      <Card>
        <EmptyState
          title="Not moved in yet"
          body={note}
          action={<Button variant="outline" size="sm" onClick={() => window.history.back()}>Go back</Button>}
        />
      </Card>
    </div>
  );
}

const hosted = (id, title, icon, note) => ({
  id,
  title,
  icon,
  tier: 'hosted',
  routes: [{ path: `/${id}`, element: <Placeholder name={title} note={note} /> }],
});

export default [
  hosted('watch', 'Streaming', Clapperboard,
    'Your Drive-backed player lives here. It keeps its own data entirely.'),
];
