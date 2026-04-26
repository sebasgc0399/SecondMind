// Helpers compartidos de fecha. Usa Intl nativo — sin deps de date-fns.
// Consumidores: NoteCard (F6), InboxItem (F8), useTasks/TasksPage (F3 fase 2).

export function formatRelative(ms: number): string {
  if (!ms) return '';
  const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60000);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (min < 1) return 'hace instantes';
  if (min < 60) return rtf.format(-min, 'minute');
  if (hr < 24) return rtf.format(-hr, 'hour');
  if (day < 7) return rtf.format(-day, 'day');
  if (day < 30) return rtf.format(-Math.floor(day / 7), 'week');
  if (day < 365) return rtf.format(-Math.floor(day / 30), 'month');
  return rtf.format(-Math.floor(day / 365), 'year');
}

export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function endOfDay(ms: number = Date.now()): number {
  const d = new Date(ms);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export function isSameDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b);
}
