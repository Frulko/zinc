// What typing does in a block. The rules are Carnet's: its Markdown shortcuts (@nbe/core matchAutoformat: "# ", "- ", "[] ",
// "> " a toggle and '" ' a quote as in Notion...), its split, merge, nesting, moves and history; this file maps keys to them.
// The arrows cross block edges and "/" opens the slash menu.
import * as ui from 'zinc:ui';
import { matchAutoformat, applyAutoformat, applyDividerAutoformat } from '@nbe/core';
import { Block, Page, pageOf, editText, insertBlockAfter, neighbour, duplicateBlock, toggleChecked, split, joinUp, joinDown,
  indentBy, moveUpDown, changeType, undo } from '../state';
import { T_TEXT, T_H1, T_H2, T_H3, T_BULLET, T_NUMBER, T_TODO, T_CODE } from '../constants';
import { focusBlock, focusTitle } from './focus';
import { appRoot } from './root';
import { menuKey, openMenu, followMenu, closeMenu, menuOpen } from './SlashMenu';

/** Cmd+Alt+digit, as Notion: 0 text, 1-3 headings, 4 to-do, 5 bullet, 6 numbered, 8 code. */
const TYPE_KEYS: string[] = [T_TEXT, T_H1, T_H2, T_H3, T_TODO, T_BULLET, T_NUMBER, '', T_CODE];

/** Every edit of a block's field. */
export function onBlockInput(b: Block, v: string): void {
  const h = b.ref.node, caret = h >= 0 ? ui.caretOf(h) : v.length;
  const p = pageOf(b) as Page;
  editText(b, v);
  if (b.type() === T_TEXT) {
    const before = v.slice(0, caret);
    if (before === '---') { applyDividerAutoformat(p.editor, b.id); return; }
    const rule = matchAutoformat(before, p.editor.plugins);
    if (rule !== null) { applyAutoformat(p.editor, b.id, rule); if (h >= 0) ui.select(h, 0, 0); return; }
  }
  if (menuOpen()) followMenu(b, v, caret);
  else if (caret > 0 && v.charAt(caret - 1) === '/' && (caret === 1 || v.charAt(caret - 2) === ' ' || v.charAt(caret - 2) === '\n') && b.type() !== T_CODE) openMenu(b, caret - 1, appRoot.node);
}

function atFirstRow(h: number): boolean { return ui.editRowOf(h, ui.caretOf(h)) === 0; }
function atLastRow(h: number): boolean { return ui.editRowOf(h, ui.caretOf(h)) >= ui.editView(h)[5] - 1; }
function collapsed(h: number): boolean { return ui.caretOf(h) === ui.anchorOf(h); }

/** The keys of a block's field, before the field edits. */
export function onBlockKey(b: Block, e: ui.KeyEvent): void {
  const h = b.ref.node;
  if (h < 0) return;
  if (menuKey(e)) { e.preventDefault(); return; }
  const k = e.key, caret = ui.caretOf(h), len = ui.getValue(h).length;
  let done = true;
  if (k === 'Enter' && e.primary && b.type() === T_TODO) toggleChecked(b);
  else if (k === 'Enter' && !e.shift && !e.primary && b.type() !== T_CODE) { if (!collapsed(h)) editText(b, ui.getValue(h).slice(0, Math.min(caret, ui.anchorOf(h))) + ui.getValue(h).slice(Math.max(caret, ui.anchorOf(h)))); split(b, Math.min(caret, ui.anchorOf(h))); }
  else if (k === 'Backspace' && caret === 0 && collapsed(h) && !e.primary && !e.alt) {
    if (!joinUp(b) && neighbour(b, -1, false) === null && b.text() === '') { const p = pageOf(b); if (p !== null) focusTitle(p as Page); }
  }
  else if (k === 'Delete' && caret === len && collapsed(h)) joinDown(b);
  else if (k === 'Tab' && b.type() !== T_CODE) { indentBy(b, e.shift ? -1 : 1); focusBlock(b, caret); }
  else if ((k === 'ArrowUp' || k === 'ArrowDown') && e.primary && e.shift) { moveUpDown(b, k === 'ArrowUp'); focusBlock(b, caret); }
  else if (k === 'z' && e.primary) undo(b, pageOf(b) as Page, e.shift);
  else if (k === 'ArrowUp' && !e.shift && atFirstRow(h)) {
    const prev = neighbour(b, -1, true);
    if (prev !== null) focusBlock(prev as Block, -1); else { const p = pageOf(b); if (p !== null) focusTitle(p as Page); }
  } else if (k === 'ArrowDown' && !e.shift && atLastRow(h)) {
    const next = neighbour(b, 1, true);
    if (next !== null) focusBlock(next as Block, 0); else done = false;
  } else if (k === 'ArrowLeft' && !e.shift && caret === 0 && collapsed(h)) {
    const prev = neighbour(b, -1, true);
    if (prev !== null) focusBlock(prev as Block, -1); else done = false;
  } else if (k === 'ArrowRight' && !e.shift && caret === len && collapsed(h)) {
    const next = neighbour(b, 1, true);
    if (next !== null) focusBlock(next as Block, 0); else done = false;
  } else if (k === 'd' && e.primary) { const c = duplicateBlock(b); if (c !== null) focusBlock(c, caret); }
  else if (e.primary && e.alt && k.length === 1 && k >= '0' && k <= '8' && TYPE_KEYS[k.charCodeAt(0) - 48] !== '') changeType(b, TYPE_KEYS[k.charCodeAt(0) - 48]);
  else if (k === 'Escape') { closeMenu(); done = false; }
  else done = false;
  if (done) e.preventDefault();
}

/** The page title: Enter and ↓ go to the first block (made when the page has none). */
export function onTitleKey(p: Page, e: ui.KeyEvent): void {
  if (e.key !== 'Enter' && e.key !== 'ArrowDown') return;
  if (e.key === 'ArrowDown' && !atLastRow(p.titleRef.node)) return;
  const first = p.items.length > 0 ? p.items[0] : insertBlockAfter(p, null, T_TEXT, '');
  if (e.key === 'Enter' && first.text() !== '') focusBlock(insertBlockAfter(p, null, T_TEXT, ''), 0);
  else focusBlock(first, 0);
  e.preventDefault();
}
