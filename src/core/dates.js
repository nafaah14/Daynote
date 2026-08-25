export const startOfDay = (d = new Date()) => {
  const x = new Date(d); x.setHours(0, 0, 0, 0); return x;
};

export const endOfDay = (d = new Date()) => {
  const x = new Date(d); x.setHours(23, 59, 59, 999); return x;
};

export const endOfToday = () => endOfDay().toISOString();

export function isOverdue(iso) {
  return !!iso && new Date(iso) < new Date();
}

export function dueLabel(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const today = startOfDay();
  const days = Math.round((startOfDay(d) - today) / 86400000);
  const time = d.getHours() || d.getMinutes()
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null;

  let day;
  if (days === 0) day = 'Today';
  else if (days === 1) day = 'Tomorrow';
  else if (days === -1) day = 'Yesterday';
  else if (days < -1) day = `${Math.abs(days)} days ago`;
  else if (days < 7) day = d.toLocaleDateString([], { weekday: 'long' });
  else day = d.toLocaleDateString([], { day: 'numeric', month: 'short' });

  return time ? `${day}, ${time}` : day;
}

/** value for <input type="datetime-local"> */
export const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

export const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);
