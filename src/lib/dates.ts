/** Today's date on the phone as YYYY-MM-DD (local time, not UTC). */
export function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** A YYYY-MM-DD date moved by a number of days (negative = earlier). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const moved = new Date(Date.UTC(y, m - 1, d + days));
  return moved.toISOString().slice(0, 10);
}

/** "Good morning" / "Good afternoon" / "Good evening" for the phone's time. */
export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Whole days from a YYYY-MM-DD date to another. */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/** Which ATP week a date falls in (week 1 starts on termStart). */
export function atpWeekFor(termStart: string, date: string, offset = 0): number {
  return Math.floor(daysBetween(termStart, date) / 7) + 1 + offset;
}

/** e.g. "Monday 23 Nov" */
export function prettyDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'short' });
}
