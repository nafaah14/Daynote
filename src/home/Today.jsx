import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sunrise, ChevronRight, Pin, PinOff, EyeOff, ChevronDown, Search } from 'lucide-react';
import { useRepo } from '../core/db/repo';
import { useSettings } from '../core/settings/settings';
import { useEditors } from '../core/ui/editors';
import { integrated, hostedApps, modules } from '../registry';
import { Card, Row, SectionLabel, EmptyState, Button } from '../core/ui/components';
import { Fab } from '../core/ui/extras';
import { CaptureBar } from '../modules/inbox';
import { ListPreview, loadExpanded, persistExpanded } from '../modules/lists';
import { todayHeading } from '../core/dates';

/**
 * THE TODAY RULE
 *
 * Today shows what needs you today, nothing else:
 *   • a reminder appears if it's due today or overdue;
 *   • a list appears if it has open items;
 *   • inbox captures appear until you sort or clear them.
 *
 * Pinned items appear in their OWN module's group rather than a shared
 * "Pinned" section. A pinned reminder keeps its checkbox and due date, a
 * pinned note keeps its colour and preview, a pinned list keeps its expand
 * arrow — where a common section flattened all three to a bare title.
 * `hidden` still keeps a record off Today entirely.
 */
export default function Today() {
  const repo = useRepo();
  const s = useSettings();
  const nav = useNavigate();
  const { openForRecord } = useEditors();
  const [expanded, setExpanded] = useState(() => loadExpanded());

  const setHome = (id, home) => repo.update(id, { home });
  const toggleExpand = (id) =>
    setExpanded(new Set(persistExpanded(id, !expanded.has(id))));

  const cards = integrated
    .filter((m) => s.moduleShownOnHome(m.id))
    .flatMap((m) => (m.today ? m.today({ repo }) : []))
    .map((card) => (card.records
      ? { ...card, records: card.records.filter((r) => r.home !== 'hidden') }
      : card))
    .filter((card) => (card.records ? card.records.length : card.items?.length) > 0)
    .sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50));

  const allApps = [...integrated.filter((m) => m.id !== 'trash'), ...hostedApps];
  const shownApps = s.home.showApps ? allApps.filter((a) => s.appShownOnHome(a.id)) : [];
  const listCard = cards.find((c) => c.id === 'lists-open');
  const otherCards = cards.filter((c) => c.id !== 'lists-open');

  /** Pin / hide controls, shared by every row on Today. */
  const controls = (r) => (
    <>
      <button
        className="today-hide"
        title={r.home === 'pinned' ? 'Unpin' : 'Pin to Today'}
        onClick={(e) => { e.stopPropagation(); setHome(r.id, r.home === 'pinned' ? 'auto' : 'pinned'); }}
      >
        {r.home === 'pinned' ? <PinOff size={14} /> : <Pin size={14} />}
      </button>
      <button
        className="today-hide"
        title="Hide from Today"
        onClick={(e) => { e.stopPropagation(); setHome(r.id, 'hidden'); }}
      >
        <EyeOff size={14} />
      </button>
    </>
  );

  const nothing = cards.length === 0 && shownApps.length === 0;

  return (
    <div className="page has-fab">
      <header className="day-head">
        <span className="eyebrow">Today</span>
        <h1 className="day-date serif">{todayHeading()}</h1>
      </header>

      <Card className="capture-card"><CaptureBar /></Card>

      {nothing && (
        <Card>
          <EmptyState
            icon={Sunrise}
            title="A clear day"
            body="Nothing needs you today. Capture a thought above when one turns up."
          />
        </Card>
      )}

      {otherCards.map((card) => (
        <section key={card.id}>
          <SectionLabel right={
            card.more && <Button size="sm" variant="quiet" onClick={() => nav(card.more.to)}>{card.more.label}</Button>
          }>
            {card.label}
          </SectionLabel>
          <Card>
            <div className="ruled">
              {card.records
                ? card.records.map((r) => {
                    // A module can optionally mark a record as needing a
                    // full-width highlight (e.g. reminders due today) —
                    // applied here, at the item wrapper, rather than inside
                    // card.render's own row, because that row only covers
                    // today-item-main and stops before the pin/hide
                    // buttons beside it, leaving half the item untinted.
                    const tint = card.itemTint?.(r);
                    return (
                      <div
                        className={`today-item ${r.home === 'pinned' ? 'is-pinned' : ''}`}
                        style={tint ? { background: `color-mix(in srgb, ${tint} 12%, transparent)` } : undefined}
                        key={r.id}
                      >
                        <div className="today-item-main" onClick={() => openForRecord(r)}>
                          {card.render(r)}
                        </div>
                        {controls(r)}
                      </div>
                    );
                  })
                : card.items.map((it) => (
                    <Row
                      key={it.id}
                      accent={it.accent}
                      title={it.title}
                      right={it.right}
                      onClick={it.to ? () => nav(it.to) : undefined}
                    />
                  ))}
            </div>
          </Card>
        </section>
      ))}

      {listCard && (
        <section>
          <SectionLabel>{listCard.label}</SectionLabel>
          <Card>
            <div className="ruled">
              {listCard.records.map((list) => {
                const open = expanded.has(list.id);
                return (
                  <div className={`today-list-block ${list.home === 'pinned' ? 'is-pinned' : ''}`} key={list.id}>
                    <div className="today-item">
                      <div className="today-item-main" onClick={() => nav(`/lists/${list.id}`)}>
                        <Row
                          accent="var(--accent-lists)"
                          title={list.title}
                          right={<span className="mono">{listCard.counts[list.id] ?? 0}</span>}
                        />
                      </div>
                      <button
                        className={`list-expand-btn ${open ? 'is-open' : ''}`}
                        onClick={(e) => { e.stopPropagation(); toggleExpand(list.id); }}
                        aria-label={open ? 'Collapse list' : 'Expand list'}
                        aria-expanded={open}
                      >
                        <ChevronDown size={16} />
                      </button>
                      {controls(list)}
                    </div>
                    {open && <div className="list-sub-items"><ListPreview listId={list.id} /></div>}
                  </div>
                );
              })}
            </div>
          </Card>
        </section>
      )}

      {shownApps.length > 0 && (
        <section>
          <SectionLabel>Apps</SectionLabel>
          <Card>
            <div className="ruled">
              {shownApps.map((a) => (
                <Row
                  key={a.id}
                  lead={<a.icon size={17} strokeWidth={1.7} style={{ marginTop: 1, color: 'var(--muted)' }} />}
                  title={a.title}
                  right={<ChevronRight size={14} />}
                  onClick={() => nav(a.routes[0].path)}
                />
              ))}
            </div>
          </Card>
        </section>
      )}

      <Fab
        icon={Search}
        label="Search"
        onClick={() => window.dispatchEvent(new CustomEvent('daybook:open-search'))}
      />
    </div>
  );
}
