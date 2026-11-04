import * as storage from 'zinc:storage';
export function readBest(key: string): number {
  const value = Number(storage.get('pixel-plays:' + key));
  return Number.isFinite(value) ? value : 0;
}
export function saveBest(key: string, value: number): void {
  try { storage.set('pixel-plays:' + key, String(value)); }
  catch (error) { console.warn('Best score could not be saved: ' + error.message); }
}
