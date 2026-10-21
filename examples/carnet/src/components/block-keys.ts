// What typing does in a block, as in Notion: Enter splits the block, Backspace at its start turns it back into text, then
// joins it to the block above; the arrows cross block edges; Tab nests; Markdown shortcuts ("# ", "- ", "[] ", "> ", "```",
// "---") turn the block into their type as they are typed; "/" opens the slash menu.
import * as ui from 'zinc:ui';
import { Block, Page, pageOf, editText, changeType, insertBlockAfter, deleteBlock, indentBy, neighbour, moveBlock, duplicateBlock, toggleChecked } from '../state';
import { T_TEXT, T_H1, T_H2, T_H3, T_BULLET, T_NUMBER, T_TODO, T_QUOTE, T_CALLOUT, T_CODE, T_DIVIDER } from '../constants';
import { focusBlock, focusTitle } from './focus';
import { appRoot } from './root';
import { menuKey, openMenu, followMenu, closeMenu, menuOpen } from './SlashMenu';


const LIST_TYPES: string[] = [T_BULLET, T_NUMBER, T_TODO];
class Shortcut { prefix: string; type: string; constructor(prefix: string, type: string) { this.prefix = prefix; this.type = type; } }
const SHORTCUTS: Shortcut[] = [
  new Shortcut('# ', T_H1), new Shortcut('## ', T_H2), new Shortcut('### ', T_H3),
  new Shortcut('- ', T_BULLET), new Shortcut('* ', T_BULLET), new Shortcut('+ ', T_BULLET), new Shortcut('1. ', T_NUMBER),
  new Shortcut('[] ', T_TODO), new Shortcut('[ ] ', T_TODO), new Shortcut('> ', T_QUOTE), new Shortcut('" ', T_QUOTE), new Shortcut('```', T_CODE),
];
/** Cmd+Alt+digit, as Notion: 0 text, 1-3 headings, 4 to-do, 5 bullet, 6 numbered, 8 code. */
const TYPE_KEYS: string[] = [T_TEXT, T_H1, T_H2, T_H3, T_TODO, T_BULLET, T_NUMBER, '', T_CODE];

function setField(b: Block, text: string, caret: i32): void {
  const h = b.ref.node;
  if (h < 0) return;
  ui.setValue(h, text);
  ui.select(h, caret, caret);
}

/** Every edit of a block's field. */
export function onBlockInput(b: Block, v: string): void {
  const h = b.ref.node, caret = h >= 0 ? ui.caretOf(h) : v.length;
  if (b.type() === T_TEXT) {
    if (v === '---' && caret === 3) {   // a divider, and the caret goes on in a new block below
      editText(b, ''); setField(b, '', 0); changeType(b, T_DIVIDER);
      focusBlock(insertBlockAfter(pageOf(b) as Page, b, T_TEXT, '', b.indent()), 0);
      return;
    }
    for (const s of SHORTCUTS) {
      if (caret !== s.prefix.length || !v.startsWith(s.prefix)) continue;
      const rest = v.slice(s.prefix.length);
      changeType(b, s.type); editText(b, rest); setField(b, rest, 0);
      return;
    }
  }
  editText(b, v);
  if (menuOpen()) followMenu(b, v, caret);
  else if (caret > 0 && v.charAt(caret - 1) === '/' && (caret === 1 || v.charAt(caret - 2) === ' ' || v.charAt(caret - 2) === '\n') && b.type() !== T_CODE) openMenu(b, caret - 1, appRoot.node);
}

function atFirstRow(h: i32): boolean { return ui.editRowOf(h, ui.caretOf(h)) === 0; }
function atLastRow(h: i32): boolean { return ui.editRowOf(h, ui.caretOf(h)) >= ui.editView(h)[5] - 1; }
function collapsed(h: i32): boolean { return ui.caretOf(h) === ui.anchorOf(h); }

/** Enter: the text after the caret goes to a new block below; at the start of a block, an empty block goes above; an empty
 *  list item leaves the list. A heading, a quote or a callout is followed by text, a list item by the next item. */
function split(b: Block, h: i32): void {
  const v = ui.getValue(h), c = ui.caretOf(h), a = ui.anchorOf(h), lo = Math.min(a, c), hi = Math.max(a, c);
  const type = b.type(), p = pageOf(b) as Page;
  if (v === '' && (LIST_TYPES.indexOf(type) >= 0 || type === T_QUOTE)) { changeType(b, T_TEXT); return; }
  const next = type === T_H1 || type === T_H2 || type === T_H3 || type === T_QUOTE || type === T_CALLOUT ? T_TEXT : type;
  if (hi === 0 && v !== '') { insertBlockAfter(p, neighbour(b, -1, false), next, '', b.indent()); return; }
  const head = v.slice(0, lo), tail = v.slice(hi);
  editText(b, head); ui.setValue(h, head);
  focusBlock(insertBlockAfter(p, b, next, tail, b.indent()), 0);
}

/** Backspace at the start: text first, then out of the nesting, then into the block above. */
function joinUp(b: Block, h: i32): void {
  if (b.type() !== T_TEXT) { changeType(b, T_TEXT); return; }
  if (indentBy(b, -1)) return;
  const prev = neighbour(b, -1, false);
  if (prev === null) { const p = pageOf(b); if (p !== null && b.text() === '') focusTitle(p as Page); return; }
  const up = prev as Block;
  if (up.type() === T_DIVIDER) { deleteBlock(up); return; }
  const at = up.text().length;
  editText(up, up.text() + b.text());
  deleteBlock(b);
  focusBlock(up, at);
}

/** Delete at the end: the block below comes up into this one. */
function joinDown(b: Block, h: i32): void {
  const next = neighbour(b, 1, false);
  if (next === null) return;
  const down = next as Block;
  if (down.type() === T_DIVIDER) { deleteBlock(down); return; }
  const at = b.text().length, joined = b.text() + down.text();
  editText(b, joined); setField(b, joined, at);
  deleteBlock(down);
}

function indexIn(b: Block): i32 { const p = pageOf(b); return p === null ? 0 : (p as Page).items.indexOf(b); }

/** The keys of a block's field, before the field edits. */
export function onBlockKey(b: Block, e: ui.KeyEvent): void {
  const h = b.ref.node;
  if (h < 0) return;
  if (menuKey(e)) { e.preventDefault(); return; }
  const k = e.key, caret = ui.caretOf(h), len = ui.getValue(h).length;
  let done = true;
  if (k === 'Enter' && e.primary && b.type() === T_TODO) toggleChecked(b);
  else if (k === 'Enter' && !e.shift && !e.primary && b.type() !== T_CODE) split(b, h);
  else if (k === 'Backspace' && caret === 0 && collapsed(h) && !e.primary && !e.alt) joinUp(b, h);
  else if (k === 'Delete' && caret === len && collapsed(h)) joinDown(b, h);
  else if (k === 'Tab' && b.type() !== T_CODE) indentBy(b, e.shift ? -1 : 1);
  else if ((k === 'ArrowUp' || k === 'ArrowDown') && e.primary && e.shift) {
    const i = indexIn(b);
    moveBlock(b, k === 'ArrowUp' ? i - 1 : i + 1);
    focusBlock(b, caret);
  } else if (k === 'ArrowUp' && !e.shift && atFirstRow(h)) {
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
  } else if (k === 'd' && e.primary) focusBlock(duplicateBlock(b), caret);
  else if (e.primary && e.alt && k.length === 1 && k >= '0' && k <= '8' && TYPE_KEYS[k.charCodeAt(0) - 48] !== '') changeType(b, TYPE_KEYS[k.charCodeAt(0) - 48]);
  else if (k === 'Escape') { closeMenu(); done = false; }
  else done = false;
  if (done) e.preventDefault();
}

/** The page title: Enter and ↓ go to the first block (made when the page has none). */
export function onTitleKey(p: Page, e: ui.KeyEvent): void {
  if (e.key !== 'Enter' && e.key !== 'ArrowDown') return;
  if (e.key === 'ArrowDown' && !atLastRow(p.titleRef.node)) return;
  const first = p.items.length > 0 ? p.items[0] : insertBlockAfter(p, null, T_TEXT, '', 0);
  if (e.key === 'Enter' && first.text() !== '') focusBlock(insertBlockAfter(p, null, T_TEXT, '', 0), 0);
  else focusBlock(first, 0);
  e.preventDefault();
}
