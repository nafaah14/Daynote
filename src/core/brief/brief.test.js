import { describe, it, expect } from 'vitest';
import { buildBrief, briefDue } from './brief';

const NOW = new Date(2026, 10, 16, 7, 30); // Mon 16 Nov 2026, 7:30
const at = (d, h = 0) => new Date(2026, 10, d, h).toISOString();
const item = (id, type, dueDate, extra = {}) => ({ id, type, title: id, dueDate, completed: false, record: { links: [] }, ...extra });

describe('briefDue', () => {
  it('opens once, on the first morning visit', () => {
    expect(briefDue({}, NOW, null)).toBe(true);
    expect(briefDue({}, NOW, '2026-11-16')).toBe(false);
    expect(briefDue({}, new Date(2026, 10, 16, 13), null)).toBe(false);
    expect(briefDue({ enabled: false }, NOW, null)).toBe(false);
  });
});

describe('buildBrief', () => {
  const byDay = {
    16: [
      item('pay rent', 'payments', at(14)),
      item('call bank', 'reminders', at(16, 10)),
      item('task-1', 'tasks', at(16)),
      item('nudge', 'reminders', at(16, 9), { record: { links: [{ rel: 'task', id: 'task-1' }] } }),
      item('done one', 'tasks', at(16), { completed: true }),
    ],
    17: [item('dentist', 'reminders', at(17, 15))],
    18: [item('car service', 'tasks', at(18))],
  };
  const events = [
    { id: 'e1', title: 'Payment due', data: { dedupeKey: 'payment:pay rent:x' } },
    { id: 'e2', title: 'Stock low', data: { dedupeKey: 'stock:rice' } },
  ];
  const b = buildBrief({ itemsFor: (d) => byDay[d.getDate()] || [], events }, NOW);

  it('splits late and today, and hides a task reminder shown with its task', () => {
    expect(b.late.map((i) => i.id)).toEqual(['pay rent']);
    expect(b.today.map((i) => i.id)).toEqual(['call bank', 'task-1']);
  });

  it('adds the next two days and only notifications about something else', () => {
    expect(b.soon.map((i) => i.id)).toEqual(['dentist', 'car service']);
    expect(b.notices.map((e) => e.id)).toEqual(['e2']);
    expect(b.count).toBe(4);
  });
});
