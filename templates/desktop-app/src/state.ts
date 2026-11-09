// The app's state as signals: the router's page, the settings and the notes; every change is saved.
import { createSignal } from 'zinc:ui/solid';
import { setTheme, LIGHT, DARK } from 'zinc:ui/kit';
import { Router } from './router';
import { Settings, load, save } from './settings';

export const router = new Router();
export const [page, setPage] = createSignal<string>(router.current);
export const [collapsed, setCollapsed] = createSignal<boolean>(false);
const saved = load();
export const [userName, setUserName] = createSignal<string>(saved.name);
export const [dark, setDarkSignal] = createSignal<boolean>(saved.dark);
export const [notes, setNotesSignal] = createSignal<string[]>(saved.notes);
setTheme(saved.dark ? DARK : LIGHT);

export function go(p: string): void { if (router.go(p)) setPage(router.current); }
export function back(): void { if (router.back()) setPage(router.current); }
function persist(): void { const s = new Settings(); s.name = userName(); s.dark = dark(); s.notes = notes(); save(s); }
export function setDark(on: boolean): void { setDarkSignal(on); setTheme(on ? DARK : LIGHT); persist(); }
export function rename(n: string): void { setUserName(n); persist(); }
export function addNote(text: string): void { if (text.trim() === '') return; setNotesSignal([text.trim()].concat(notes())); persist(); }
export function removeNote(i: i32): void { const n = notes().slice(); n.splice(i, 1); setNotesSignal(n); persist(); }
