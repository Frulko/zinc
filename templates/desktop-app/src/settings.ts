// The settings and the notes, saved with zinc:storage (a file on desktops; ZINC_STORAGE names another one). encode / decode are tested.
import * as storage from 'zinc:storage';

export class Settings {
  name: string = '';
  dark: boolean = false;
  notes: string[] = [];
}

export function encode(s: Settings): string { return JSON.stringify({ name: s.name, dark: s.dark, notes: s.notes }); }

export function decode(text: string): Settings {
  const s = new Settings();
  if (text === '') return s;
  const o: any = JSON.parse(text);
  if (typeof o.name === 'string') s.name = o.name as string;
  if (typeof o.dark === 'boolean') s.dark = o.dark as boolean;
  if (Array.isArray(o.notes)) for (const n of o.notes as any[]) if (typeof n === 'string') s.notes.push(n as string);
  return s;
}

const KEY = '{{id}}.settings';
export function load(): Settings { return decode(storage.get(KEY)); }
export function save(s: Settings): void { storage.set(KEY, encode(s)); }
