// What the session holds: the settings (kept between runs), the screen shown, and what was trashed.
import { createSignal } from 'zinc:ui/solid';
import * as storage from 'zinc:storage';
import type { Album, Op, Settings } from './library';
import { defaultAlbums } from './i18n';

const KEY = 'photo-sorter:settings';
function load(): Settings {
  try {
    const s = JSON.parse(storage.get(KEY) || 'null') as Settings | null;
    if (s && Array.isArray(s.sources) && Array.isArray(s.albums)) return s;
  } catch { /* a first run */ }
  return { sources: [], output: '', mode: 'move', albums: defaultAlbums() };
}
export const [settings, setSettingsS] = createSignal<Settings>(load());
export function setSettings(patch: Partial<Settings>): void {
  const s = { ...settings(), ...patch };
  setSettingsS(s);
  storage.set(KEY, JSON.stringify(s));
}
export function setAlbums(albums: Album[]): void { setSettings({ albums }); }

export type Screen = 'setup' | 'sort' | 'done';
export const [screen, setScreen] = createSignal<Screen>('setup');

/** The pictures put aside this session, as their trash moves (what the summary empties or restores). */
export const [trashed, setTrashed] = createSignal<Op[]>([]);
/** Counts per album id this session, and the folder each one went to. */
export const [filed, setFiled] = createSignal<Record<string, { n: number; dir: string }>>({});
