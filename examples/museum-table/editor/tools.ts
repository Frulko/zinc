// The tools for agencies (ZN-650.07.05): the selection of several things, the commands on it (align, distribute, nudge, cut, copy, paste),
// and the two places every command can be chosen from besides its key and its button: the system's menu bar and the context menus
// (zinc:system/menu). One table of commands, `perform`, serves the keys (main.tsx), the menu bar and the context menus alike.
import { batch } from 'zinc:ui/solid';
import { clipboardText, setClipboardText } from 'zinc:gfx';
import * as menu from 'zinc:system/menu';
import { Sequence, Item } from '../src/project';
import { arrange, ARRANGE } from './doc';
import { doc, project, opened, selected, selectedLink, selectedItem, also, setAlso, alsoItems, setAlsoItems, select, pick, setSelected, setSelectedItem, setStatus, CARD_W, CARD_H, viewW, viewH,
  zoomBy, fit, undo, redo, save, saveAs, newProjectCommand, openCommand, openFile, guard, duplicateSelected, deleteSelection, addSequence, addSequenceInView, startHere, openSequence, raiseItem,
  advanced, setAdvanced, settings, openSettings, closeSettings, pointing } from './state';
import { recents } from './files';
import { shapeOf } from './widgets';
import { playFromHere, togglePreviewWindow } from './preview';
import * as L from './strings';
import { t, f } from './strings';

// ---------------------------------------------------------------- the selection of several things

/** The selected sequences of the storyboard, the first one selected first; none while a table is open or a link is selected. */
export function chosenSequences(): Sequence[] {
  const s = selected();
  return s === null || opened() !== null || selectedLink() !== null || settings().length > 0 ? [] : [s].concat(also());
}
/** The selected items of the open table. */
export function chosenItems(): Item[] {
  const it = selectedItem();
  return it === null || opened() === null || pointing() !== null || settings().length > 0 ? [] : [it].concat(alsoItems());
}
export function isChosen(s: Sequence): boolean { return also().indexOf(s) >= 0; }
export function isChosenItem(it: Item): boolean { return alsoItems().indexOf(it) >= 0; }
function said(): void { const n = chosenSequences().length + chosenItems().length; if (n > 1) setStatus(f(L.N_SELECTED, `${n}`)); }
/** Shift or Cmd and a click: the sequence joins the selection, or leaves it. */
export function toggleSequence(s: Sequence): void {
  const first = selected(), rest = also();
  if (first === null || selectedLink() !== null) select(s, null);
  else if (first === s) { if (rest.length === 0) select(null, null); else batch(() => { setSelected(rest[0]); setAlso(rest.slice(1)); }); }
  else setAlso(rest.indexOf(s) >= 0 ? rest.filter((o: Sequence) => o !== s) : rest.concat([s]));
  said();
}
export function toggleItem(it: Item): void {
  const first = selectedItem(), rest = alsoItems();
  if (first === null) pick(it, null, null);
  else if (first === it) { if (rest.length === 0) pick(null, null, null); else batch(() => { setSelectedItem(rest[0]); setAlsoItems(rest.slice(1)); }); }
  else setAlsoItems(rest.indexOf(it) >= 0 ? rest.filter((o: Item) => o !== it) : rest.concat([it]));
  said();
}
/** Every item of the open table, or every sequence of the storyboard. */
export function selectAll(): void {
  const s = opened();
  if (settings().length > 0 || pointing() !== null) return;
  const items: Item[] = s !== null ? s.items : [], all = project().sequences;
  if (s !== null) { if (items.length > 0) batch(() => { pick(items[0], null, null); setAlsoItems(items.slice(1)); }); }
  else if (all.length > 0) batch(() => { select(all[0], null); setAlso(all.slice(1)); });
  said();
}
/** Selects the last `n` items of the open table, or the last `n` sequences: what was just pasted. */
function selectLast(n: i32): void {
  const s = opened(), all = project().sequences, items: Item[] = s !== null ? s.items : [];
  if (s !== null) batch(() => { pick(items[items.length - n], null, null); setAlsoItems(items.slice(items.length - n + 1)); });
  else batch(() => { select(all[all.length - n], null); setAlso(all.slice(all.length - n + 1)); });
}
function openId(): string { const s = opened(); return s === null ? '' : s.id; }
function counted(n: i32): string { return f(opened() !== null ? L.SOME_MEDIA : L.SOME_SEQUENCES, `${n}`); }
/** Where each of `items` is on the table of the open sequence. */
function placesOf(items: Item[]): i32[] { const s = opened(), all: Item[] = s !== null ? s.items : []; return items.map((it: Item): i32 => all.indexOf(it)); }

// ---------------------------------------------------------------- the commands on it

/** Moves the selection by (dx, dy), in table units or in storyboard units: the arrow keys. One step for Undo. */
export function nudge(dx: number, dy: number): void {
  const table = openId(), items = chosenItems(), at = placesOf(items), sequences = chosenSequences();
  if (table.length > 0) doc().together('Nudge', () => { for (let i = 0; i < items.length; i++) doc().moveItem(table, at[i], items[i].x + dx, items[i].y + dy); });
  else doc().together('Nudge', () => { for (const q of sequences) doc().moveSequence(q.id, q.storyX + dx, q.storyY + dy); });
}
/** Aligns the selection on an edge or an axis of the group, or spreads it with equal gaps (`how`: one of ARRANGE).
 *  ponytail: a turned item counts as its unturned box. */
export function arrangeChosen(how: string): void {
  const table = openId(), items = chosenItems(), at = placesOf(items), sequences = chosenSequences(), n = table.length > 0 ? items.length : sequences.length;
  const spread = how === 'across' || how === 'down', name = t(L.ALIGN[ARRANGE.indexOf(how)]);
  if (n < (spread ? 3 : 2)) { setStatus(f(L.NEED_SEVERAL, spread ? '3' : '2')); return; }
  if (table.length > 0) {
    const to = arrange(how, items.map((it: Item) => it.x), items.map((it: Item) => it.y), items.map((it: Item) => it.width),
      items.map((it: Item) => it.height > 0 ? it.height : it.width * shapeOf(project().medium(it.media))));
    doc().together(spread ? 'Distribute' : 'Align', () => { for (let i = 0; i < n; i++) doc().moveItem(table, at[i], to[0][i], to[1][i]); });
  } else {
    const to = arrange(how, sequences.map((q: Sequence) => q.storyX), sequences.map((q: Sequence) => q.storyY), sequences.map((q: Sequence) => CARD_W), sequences.map((q: Sequence) => CARD_H));
    doc().together(spread ? 'Distribute' : 'Align', () => { for (let i = 0; i < n; i++) doc().moveSequence(sequences[i].id, to[0][i], to[1][i]); });
  }
  setStatus(f(L.DONE_ARRANGED, name, counted(n)));
}
/** What Copy would put on the clipboard ('' when nothing is selected). */
function clipOfChosen(): string {
  return openId().length > 0 ? doc().clip([], openId(), placesOf(chosenItems())) : doc().clip(chosenSequences().map((q: Sequence): string => q.id), '', []);
}
export function copy(): boolean {
  const clip = clipOfChosen();
  if (clip.length === 0) { setStatus(t(L.NOTHING_SELECTED)); return false; }
  setClipboardText(clip);
  setStatus(f(L.DONE_COPIED, counted(chosenItems().length + chosenSequences().length)));
  return true;
}
function pasteClip(clip: string): void {
  const n = doc().paste(clip, openId());
  if (n === 0) { setStatus(t(L.NOTHING_TO_PASTE)); return; }
  selectLast(n);
  setStatus(f(L.DONE_PASTED, counted(n)));
}
/** Pastes what was copied, in this project or in another one: sequences on the storyboard, media on the open table. */
export function paste(): void { if (settings().length === 0 && pointing() === null) pasteClip(clipboardText()); }
/** Deletes every selected thing in one step. The links that led to a deleted sequence go with it, and the status bar says so (Undo brings
 *  everything back); one sequence alone still asks where its links should lead (state.ts deleteSelection). */
export function deleteChosen(label: string = 'Delete'): void {
  const table = openId(), items = chosenItems(), sequences = chosenSequences(), n = table.length > 0 ? items.length : sequences.length;
  if (n < 2 && label === 'Delete') { deleteSelection(); return; }
  if (n === 0) return;
  const said = counted(n);
  batch(() => {
    if (table.length > 0) {
      const at = placesOf(items).sort((a: i32, b: i32) => b - a);   // from the last one: the places before it stay
      pick(null, null, null);
      doc().together(label, () => { for (const i of at) doc().removeItem(table, i); });
    } else {
      const ids = sequences.map((q: Sequence): string => q.id);
      select(null, null);
      doc().together(label, () => { for (const id of ids) doc().deleteSequence(id, ''); });
    }
    setStatus(f(L.DONE_REMOVED_N, said));
  });
}
export function cut(): void { if (copy()) deleteChosen('Cut'); }
/** A copy beside each selected thing, without touching the clipboard. One sequence alone keeps the Duplicate it always had. */
export function duplicate(): void {
  if (opened() === null && chosenSequences().length < 2) { duplicateSelected(); return; }
  const clip = clipOfChosen();
  if (clip.length === 0) setStatus(t(L.NOTHING_SELECTED)); else pasteClip(clip);
}
function raise(by: i32): void { const it = selectedItem(); if (it !== null && opened() !== null) raiseItem(it, by); }

// ---------------------------------------------------------------- one table of commands

class Command {
  id: string; label: i32; key: string; run: () => void;
  constructor(id: string, label: i32, key: string, run: () => void) { this.id = id; this.label = label; this.key = key; this.run = run; }
}
/** Where "New sequence here" of the storyboard's context menu puts it, in storyboard units. */
let hereX: number = 0, hereY: number = 0;
// The keys shown in the menu bar are the ones main.tsx hears. Undo, Redo, Cut, Copy, Paste and Select all show none there: a menu bar that
// owned Cmd+Z, Cmd+C or Cmd+V would take them from the text fields, which have their own.
const COMMANDS: Command[] = [
  new Command('new', L.NEW, 'CmdOrCtrl+N', newProjectCommand), new Command('open', L.OPEN, 'CmdOrCtrl+O', openCommand),
  new Command('save', L.SAVE, 'CmdOrCtrl+S', () => { save(); }), new Command('saveAs', L.SAVE_AS, 'CmdOrCtrl+Shift+S', () => { saveAs(); }),
  new Command('settings', L.KEY_SETTINGS, '', () => { if (settings().length > 0) closeSettings(); else openSettings('project'); }),
  new Command('undo', L.UNDO, '', undo), new Command('redo', L.REDO, '', redo),
  new Command('cut', L.CUT, '', cut), new Command('copy', L.COPY, '', () => { copy(); }), new Command('paste', L.PASTE, '', paste),
  new Command('duplicate', L.DUPLICATE_IT, 'CmdOrCtrl+D', duplicate), new Command('delete', L.DELETE_IT, '', () => deleteChosen()),
  new Command('selectAll', L.SELECT_ALL, '', selectAll),
  new Command('forward', L.FORWARD, '', () => raise(1)), new Command('backward', L.BACKWARD, '', () => raise(-1)),
  new Command('zoomIn', L.ZOOM_IN, '', () => zoomBy(1, viewW / 2, viewH / 2)), new Command('zoomOut', L.ZOOM_OUT, '', () => zoomBy(-1, viewW / 2, viewH / 2)),
  new Command('fit', L.FIT_ALL, 'CmdOrCtrl+0', fit), new Command('advanced', L.ADVANCED, 'CmdOrCtrl+E', () => setAdvanced(!advanced())),
  new Command('play', L.PLAY_FROM_HERE, '', playFromHere), new Command('window', L.KEY_WINDOW, '', togglePreviewWindow),
  new Command('newSequence', L.NEW_SEQUENCE, '', addSequenceInView), new Command('newHere', L.M_NEW_HERE, '', () => addSequence(hereX, hereY)),
  new Command('openTable', L.M_OPEN_TABLE, '', () => { const s = selected(); if (s !== null) openSequence(s); }), new Command('start', L.M_START, '', startHere),
];
for (let i = 0; i < ARRANGE.length; i++) { const how = ARRANGE[i]; COMMANDS.push(new Command(`arrange:${how}`, L.ALIGN[i], '', () => arrangeChosen(how))); }
function commandOf(id: string): Command | null {
  for (const c of COMMANDS) if (c.id === id) return c;
  return null;
}

let frame: i32 = 0, lastId = '', lastFrame: i32 = -9;
/** Once a frame (main.tsx). */
export function toolsTick(): void { frame++; }
/** Runs a command by its id; false when there is none of that name. A command a menu asks for (`fromMenu`) within two frames of the same
 *  command runs once: a native menu reports the choice of a context menu both as its answer and as a click, and may report a key it
 *  shows beside the key itself. */
export function perform(id: string, fromMenu: boolean = false): boolean {
  if (id.startsWith('recent:')) {
    const at: i32 = parseInt(id.slice(7)), files = recents();
    if (at >= 0 && at < files.length) guard(() => { openFile(files[at]); });
    return true;
  }
  const c = commandOf(id);
  if (c === null) return false;
  if (fromMenu && id === lastId && frame - lastFrame < 2) return true;
  lastId = id; lastFrame = frame;
  c.run();
  return true;
}

// ---------------------------------------------------------------- the menu bar and the context menus

function entry(id: string): menu.Item { const c = commandOf(id); return c === null ? menu.separator() : menu.item(id, t(c.label), c.key); }
function entries(ids: string[]): menu.Item[] { return ids.map((id: string) => entry(id)); }
const ARRANGING: string[] = ARRANGE.map((how: string) => `arrange:${how}`);
let heard = false;
/** Sets the application's menu bar, in the interface language, with the recent projects of now. */
export function setMenus(): void {
  if (!heard) {
    heard = true;
    for (const c of COMMANDS) { const id = c.id; menu.onClick(id, (source: string) => { perform(id, true); }); }
    for (let i = 0; i < 10; i++) { const id = `recent:${i}`; menu.onClick(id, (source: string) => { perform(id, true); }); }
  }
  const files = recents();
  const recent = files.length === 0 ? [menu.item('recent:none', t(L.NO_RECENT))] : files.map((file: string, i: i32) => menu.item(`recent:${i}`, file));
  if (files.length === 0) recent[0].enabled = false;
  menu.setApp([menu.role('appMenu'),
    menu.submenu(t(L.M_FILE), [entry('new'), entry('open'), menu.submenu(t(L.OPEN_RECENT), recent), menu.separator(), entry('save'), entry('saveAs'), menu.separator(), entry('settings')]),
    menu.submenu(t(L.M_EDIT), entries(['undo', 'redo', '', 'cut', 'copy', 'paste', 'duplicate', 'delete', '', 'selectAll'])),
    menu.submenu(t(L.M_ARRANGE), entries(ARRANGING.slice(0, 6).concat(['']).concat(ARRANGING.slice(6)).concat(['', 'forward', 'backward']))),
    menu.submenu(t(L.M_VIEW), entries(['zoomIn', 'zoomOut', 'fit', '', 'advanced', '', 'play', 'window'])),
    menu.role('windowMenu')]);
}
/** The context menu of what is under the pointer, at (x, y) of the window: `on` is 'sequence', 'storyboard', 'item' or 'table'; (hx, hy)
 *  is the point of the storyboard a new sequence would take. What is chosen runs as the same command the keys and the menu bar run. */
export function contextMenu(on: string, x: number, y: number, hx: number = 0, hy: number = 0): void {
  hereX = hx; hereY = hy;
  const several = chosenSequences().length + chosenItems().length > 1;
  const arranging: string[] = several ? [''].concat(ARRANGING) : [];
  const ids = on === 'sequence' ? (several ? ['cut', 'copy', 'duplicate', 'delete'].concat(arranging) : ['openTable', 'start', 'play', '', 'cut', 'copy', 'duplicate', 'delete'])
    : on === 'storyboard' ? ['newHere', 'paste', '', 'selectAll', 'fit']
    : on === 'item' ? ['cut', 'copy', 'duplicate', 'delete'].concat(several ? arranging : ['', 'forward', 'backward'])
    : ['paste', 'selectAll'];
  menu.popup(entries(ids), x, y).then((id: string) => { if (id.length > 0) perform(id, true); });
}
