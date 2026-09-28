// Find in file (⌘F): case-insensitive matches of the query in the active buffer, the current one selected in the
// editor. Enter / ⇧Enter (or ⌘G / ⌘⇧G) go to the next / previous match.
import { createSignal, createMemo } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { Tween, easeOut, easeInOut } from './motion';
import { active, activate, Buffer } from './workspace';
import { Doc } from './document';

export const [findOpen, setFindOpen] = createSignal<boolean>(false);
export const [query, setQuery] = createSignal<string>('');
export const [current, setCurrent] = createSignal<i32>(0);
/** 0 closed → 1 open: the find bar slides down under the tabs. */
export const findT = new Tween(0);

/** Start offsets of every match (at most 10000), searched line by line (see document.ts on string indexing). */
export function findAll(doc: Doc, q: string): i32[] {
  const out: i32[] = [];
  if (q.length === 0) return out;
  const needle = q.toLowerCase();
  for (let l = 0; l < doc.lines.length && out.length < 10000; l++) {
    const hay = doc.lines[l].toLowerCase();
    let p = hay.indexOf(needle);
    while (p >= 0 && out.length < 10000) { out.push(doc.starts[l] + p); p = hay.indexOf(needle, p + needle.length); }
  }
  return out;
}

const NONE: i32[] = [];
export const matches = createMemo<i32[]>((): i32[] => {
  const b = active();
  if (b === null) return NONE;
  (b as Buffer).text();   // tracked: the matches follow the edits
  return findAll((b as Buffer).doc, query());
}, NONE);

export function openFind(): void {
  if (!findOpen()) { setFindOpen(true); findT.to(1, 0.18, easeOut); }
  // prefill with the selection, like most editors
  const b = active();
  if (b !== null && (b as Buffer).node() >= 0) {
    const sel = ui.selectedText((b as Buffer).node());
    if (sel.length > 0 && sel.indexOf('\n') < 0) setQuery(sel);
  }
}
export function closeFind(): void {
  if (!findOpen()) return;
  findT.to(0, 0.14, easeInOut, () => setFindOpen(false));
  const b = active();
  if (b !== null) activate(b as Buffer);
}

/** Selects match i (wrapping) in the editor and scrolls it into the middle of the view when it is off screen. */
export function goTo(i: i32): void {
  const m = matches(), b = active();
  if (m.length === 0 || b === null) return;
  const k: i32 = ((i % m.length) + m.length) % m.length;
  setCurrent(k);
  const h = (b as Buffer).node();
  ui.select(h, m[k], m[k] + query().length);
  const v = ui.editView(h), row = ui.editRowOf(h, m[k]);
  const y = row * v[4];
  if (y < v[1] || y + v[4] > v[1] + v[3]) ui.scrollEditTo(h, v[0], y - v[3] / 2);
}
export function next(step: i32): void { goTo(current() + step); }
/** After the query changes: the first match at or after the caret. */
export function findFromCaret(): void {
  const m = matches(), b = active();
  if (m.length === 0 || b === null) { setCurrent(0); return; }
  const h = (b as Buffer).node();
  const caret = ui.caretOf(h) - ui.selectedText(h).length;   // start of the current selection
  let k: i32 = 0;
  while (k < m.length && m[k] < caret) k++;
  goTo(k >= m.length ? 0 : k);
}
