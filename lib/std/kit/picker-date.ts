// Civil ISO dates stay independent of local time zones and daylight-saving changes.
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= '0001-01-01';
}
export function dateDay(value: string): number { return new Date(value + 'T00:00:00Z').getTime() / 86400000; }
export function dayDate(day: number): string { return new Date(day * 86400000).toISOString().slice(0, 10); }
export function moveDate(value: string, days: number): string { return dayDate(Math.max(dateDay('0001-01-01'), Math.min(dateDay('9999-12-31'), dateDay(value) + days))); }
export function moveMonth(value: string, months: number): string {
  const date = new Date(value + 'T00:00:00Z'), day = date.getUTCDate();
  date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + months);
  const year = date.getUTCFullYear();
  if (year < 1) return '0001-01-01';
  if (year > 9999) return '9999-12-31';
  const first = date.getTime() / 86400000;
  date.setUTCMonth(date.getUTCMonth() + 1);
  return dayDate(first + Math.min(day, date.getTime() / 86400000 - first) - 1);
}
export function dateWeekday(value: string): number { return new Date(value + 'T00:00:00Z').getUTCDay(); }
export function todayDate(): string { const d = new Date(); return String(d.getFullYear()).padStart(4, '0') + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
