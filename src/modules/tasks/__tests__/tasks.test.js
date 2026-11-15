import { describe, it, expect } from 'vitest';
import {
  parseQuick, groupTasks, dayIso, tagsOf, TYPE, REMINDER_TYPE, syncReminders, remindersOf, nextReminders, setTaskDone, deleteTask,
} from '../lib/tasks';

const NOW = new Date(2026, 10, 15, 9, 30); // 15 Nov 2026, 9:30 local
const t = (title, extra = {}) => ({
  title, createdAt: '2026-11-01T00:00:00Z', doneAt: null, dueAt: null, tags: [], data: {}, ...extra,
});

describe('parseQuick', () => {
  it('reads tag, priority and a trailing day', () => {
    expect(parseQuick('Pay water bill #home ! tomorrow', NOW)).toEqual({
      title: 'Pay water bill', tag: 'home', priority: 'high', due: '2026-11-16',
    });
    expect(parseQuick('Call Ali today', NOW).due).toBe('2026-11-15');
  });

  it('leaves a plain title alone', () => {
    expect(parseQuick('  Tomorrow  ', NOW)).toEqual({ title: 'Tomorrow', tag: '', priority: 'normal', due: '' });
  });
});

describe('groupTasks', () => {
  it('splits late, today, coming up and no date, high priority first', () => {
    const tasks = [
      t('later', { dueAt: dayIso('2026-11-20') }),
      t('today low', { dueAt: dayIso('2026-11-15'), data: { priority: 'low' } }),
      t('today high', { dueAt: dayIso('2026-11-15'), data: { priority: 'high' } }),
      t('late', { dueAt: dayIso('2026-11-14') }),
      t('whenever'),
      t('finished', { doneAt: '2026-11-14T10:00:00Z' }),
    ];
    const g = groupTasks(tasks, NOW);
    expect(g.late.map((x) => x.title)).toEqual(['late']);
    expect(g.today.map((x) => x.title)).toEqual(['today high', 'today low']);
    expect(g.soon.map((x) => x.title)).toEqual(['later']);
    expect(g.someday.map((x) => x.title)).toEqual(['whenever']);
    expect(g.done.map((x) => x.title)).toEqual(['finished']);
  });

  it('lists tags once, sorted', () => {
    expect(tagsOf([t('a', { tags: ['home'] }), t('b', { tags: ['car'] }), t('c', { tags: ['home'] })])).toEqual(['car', 'home']);
  });
});

describe('reminders on a task', () => {
  const fakeRepo = () => {
    let n = 0;
    const recs = [];
    return {
      recs,
      query: ({ type }) => recs.filter((r) => r.type === type && !r.deletedAt),
      get: (id) => recs.find((r) => r.id === id),
      create: (type, f) => { const r = { id: `r${++n}`, type, links: [], data: {}, doneAt: null, deletedAt: null, ...f }; recs.push(r); return r; },
      update: (id, patch) => Object.assign(recs.find((r) => r.id === id), patch),
      softDelete: (id) => Object.assign(recs.find((r) => r.id === id), { deletedAt: 'now' }),
    };
  };

  it('creates, retitles, reschedules and removes linked reminders', () => {
    const repo = fakeRepo();
    const task = repo.create(TYPE, { title: 'Renew passport' });
    syncReminders(repo, task.id, 'Renew passport', [{ at: '2026-11-16T04:00:00.000Z' }, { at: '2026-11-18T04:00:00.000Z' }]);
    const [a, b] = remindersOf(repo, task.id);
    expect(a).toMatchObject({ type: REMINDER_TYPE, title: 'Renew passport', links: [{ rel: 'task', id: task.id }] });
    expect(nextReminders(repo.query({ type: REMINDER_TYPE })).get(task.id)).toBe('2026-11-16T04:00:00.000Z');

    repo.update(a.id, { data: { pushedAt: 'x' } });
    syncReminders(repo, task.id, 'Renew passports', [{ id: a.id, at: '2026-11-17T04:00:00.000Z' }]);
    expect(remindersOf(repo, task.id)).toHaveLength(1);
    expect(repo.get(a.id)).toMatchObject({ title: 'Renew passports', dueAt: '2026-11-17T04:00:00.000Z', data: { pushedAt: null } });
    expect(repo.get(b.id).deletedAt).toBe('now');
  });

  it('closes reminders when the task is done, and deletes them with it', () => {
    const repo = fakeRepo();
    const task = repo.create(TYPE, { title: 'Pay fine' });
    syncReminders(repo, task.id, 'Pay fine', [{ at: '2026-11-16T04:00:00.000Z' }]);
    setTaskDone(repo, task, true);
    expect(remindersOf(repo, task.id)[0].doneAt).toBeTruthy();
    deleteTask(repo, task);
    expect(remindersOf(repo, task.id)).toEqual([]);
    expect(task.deletedAt).toBe('now');
  });
});
