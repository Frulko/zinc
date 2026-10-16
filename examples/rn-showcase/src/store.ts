// What the app keeps between runs, in zinc:storage (a key-value file of the app: ~/.zinc/storage.kv on desktops, ZINC_STORAGE names another one):
// the preferences and the notes. Writes are synchronous and small; the notes are one line each (`id TAB done TAB text`, tabs and newlines escaped).
import * as storage from 'zinc:storage';
import { Appearance } from 'zinc:react-native';
import { env } from 'zinc:sys';
import { setLanguage } from './i18n';
import { trace } from './nav';

const PREFS = 'rn-showcase.prefs', NOTES = 'rn-showcase.notes';

export class Prefs { theme: string = 'system'; lang: string = 'en'; digest: boolean = true; units: number = 0; nickname: string = ''; }
export const prefs = new Prefs();

export class Note {
  id: number; text: string; done: boolean;
  constructor(id: number, text: string, done: boolean) { this.id = id; this.text = text; this.done = done; }
}
export let notes: Note[] = [];
const FIRST: string[] = ['Try the swipe cards on Motion', 'Send a message on the live feed', 'Switch to the dark theme', 'Restart the app: these notes stay'];

function esc(s: string): string { return s.split('\\').join('\\\\').split('\t').join('\\t').split('\n').join('\\n'); }
function unesc(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s.charAt(i);
    if (ch === '\\' && i + 1 < s.length) { const n = s.charAt(++i); out += n === 't' ? '\t' : n === 'n' ? '\n' : n; } else out += ch;
  }
  return out;
}

/** The scheme the preference asks for: 'system' follows ZINC_COLOR_SCHEME (the system setting is not read yet). */
export function applyTheme(): void {
  const sys = env('ZINC_COLOR_SCHEME') === 'dark' ? 'dark' : 'light';
  Appearance.setColorScheme(prefs.theme === 'system' ? sys : prefs.theme);
}

export function loadPrefs(): void {
  const p = storage.get(PREFS).split('\n');
  if (p.length >= 5) { prefs.theme = p[0]; prefs.lang = p[1]; prefs.digest = p[2] === '1'; prefs.units = parseInt(p[3]); prefs.nickname = unesc(p[4]); }
  if (env('SHOWCASE_LANG') === '') setLanguage(prefs.lang);
  applyTheme();
  const raw = storage.get(NOTES);
  notes = [];
  if (storage.keys().indexOf(NOTES) < 0) { for (let i = 0; i < FIRST.length; i++) notes.push(new Note(i + 1, FIRST[i], i === 3)); return; }
  for (const line of raw.split('\n')) {
    const a = line.split('\t');
    if (a.length === 3) notes.push(new Note(parseInt(a[0]), unesc(a[2]), a[1] === '1'));
  }
  trace(`notes loaded: ${notes.length}${notes.length > 0 ? `, first "${notes[0].text}"` : ''}`);
}
export function savePrefs(): void {
  storage.set(PREFS, [prefs.theme, prefs.lang, prefs.digest ? '1' : '0', `${prefs.units}`, esc(prefs.nickname)].join('\n'));
}
export function saveNotes(list: Note[]): void {
  notes = list;
  trace(`notes saved: ${list.length}`);
  storage.set(NOTES, list.map((n: Note) => `${n.id}\t${n.done ? '1' : '0'}\t${esc(n.text)}`).join('\n'));
}
export function nextId(): number { let m = 0; for (const n of notes) m = Math.max(m, n.id); return m + 1; }
