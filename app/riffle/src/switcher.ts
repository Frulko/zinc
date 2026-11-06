// The switcher's state and its actions: the windows in rank order, the hold that browses them, and what ends it. The UI only reads this.
import { imageFromBytes } from 'zinc:gfx';
import * as ui from 'zinc:ui';
import { createSignal } from 'zinc:ui/solid';
import { quit } from 'zinc:system';
import * as D from 'zinc:desktop-windows';
import { DesktopWindow } from 'zinc:desktop-windows';
import { Recency, SavedRank, firstSelection, focusIsStale, keepingOrder, restoreOrder, scrolledStart, selectionInView, visibleStart } from './recency';
import { loadSavedOrder, saveOrder, settings } from './settings';
import { BAR_HEIGHT, PANEL_PADDING, density } from './theme';

export type Mode = 'hidden' | 'picker' | 'settings';
export const [mode, setMode] = createSignal<Mode>('hidden');
export const [rows, setRows] = createSignal<DesktopWindow[]>([]);
export const [selected, setSelected] = createSignal<number>(0);
export const [firstVisible, setFirstVisible] = createSignal<number>(0);
export const [icons, setIcons] = createSignal<Map<string, number>>(new Map<string, number>());

const SWEEP_EVERY_MS = 2000;
const REVEAL_DELAY_MS = 80;
const FRAMES_BEFORE_REVEAL = 2;
const FOCUS_SETTLE_MS = 400;
let holds = 0;
let revealed = false;
let armedAtFrame = 0;
let raisedId = -1;
let raisedAt = 0;
let wheelRest = 0;

const recency = new Recency();
let windows: DesktopWindow[] = [];
let lastSavedOrder = '';
let probing = false;
let orderBeforeRaise: number[] = [];

function windowsInRankOrder(): DesktopWindow[] {
  return windows.slice().sort((a: DesktopWindow, b: DesktopWindow) => recency.rankOf(a.id) - recency.rankOf(b.id));
}

export function pickerHeight(count: number): number {
  const shown = Math.max(1, Math.min(count, settings().maxRows));
  return shown * density().rowHeight + 2 * PANEL_PADDING + BAR_HEIGHT;
}

function rememberOrder(existing: D.ExistingWindow[]): void {
  const owners = new Map<number, number>();
  for (const w of existing) owners.set(w.id, w.pid);
  const ranks: SavedRank[] = [];
  for (const id of recency.order) {
    const pid = owners.get(id);
    if (pid !== undefined) ranks.push({ id: id, pid: pid });
  }
  const encoded = JSON.stringify(ranks);
  if (encoded === lastSavedOrder) return;
  lastSavedOrder = encoded;
  saveOrder(ranks);
}

/** Decoded between two uses, so a hold never waits for an icon. */
function loadMissingIcons(): void {
  const current = icons();
  let changed: Map<string, number> | null = null;
  for (const w of windows) {
    if (current.has(w.bundle) || w.bundle === '' || (changed !== null && changed.has(w.bundle))) continue;
    const png = D.appIcon(w.pid);
    if (png.length === 0) continue;
    if (changed === null) changed = new Map<string, number>(current);
    changed.set(w.bundle, imageFromBytes(png));
  }
  if (changed !== null) setIcons(changed);
}

function applySweep(): void {
  windows = D.listWindows();
  const existing = D.existingWindows();
  recency.reconcile(windows.map((w: DesktopWindow) => w.id), existing.map((w: D.ExistingWindow) => w.id));
  rememberOrder(existing);
  loadMissingIcons();
  if (mode() === 'picker') showRowsKeepingSelection();
  else prepareList();
}

/** Hidden, the window keeps the list it will show drawn and the release's target ready: a hold starts and ends without waiting for anything. */
function prepareList(): void {
  const next = windowsInRankOrder();
  setRows(next);
  setSelected(next.length > 0 ? firstSelection(next[0].pid, D.frontmostPid(), next.length, false) : 0);
  setFirstVisible(0);
  publishTarget();
}
function publishTarget(): void {
  const list = rows();
  if (selected() < list.length) D.setTarget(list[selected()].id, list[selected()].pid);
  else D.setTarget(-1, 0);
}

/** A sweep lands just after a hold starts: it updates the rows, and never moves one under the person's eyes. */
function showRowsKeepingSelection(): void {
  const before = rows();
  const selectedId = selected() < before.length ? before[selected()].id : -1;
  const byId = new Map<number, DesktopWindow>();
  for (const w of windows) byId.set(w.id, w);
  const ids = keepingOrder(before.map((w: DesktopWindow) => w.id), windowsInRankOrder().map((w: DesktopWindow) => w.id));
  const next: DesktopWindow[] = [];
  for (const id of ids) {
    const w = byId.get(id);
    if (w !== undefined) next.push(w);
  }
  const heightChanges = pickerHeight(next.length) !== pickerHeight(before.length);
  setRows(next);
  let at = -1;
  for (let i = 0; i < next.length; i++) if (next[i].id === selectedId) at = i;
  setSelected(at >= 0 ? at : Math.min(selected(), Math.max(0, next.length - 1)));
  followSelection();
  publishTarget();
  if (heightChanges) D.resizeOverlay(settings().width, pickerHeight(next.length));
}
function followSelection(): void {
  setFirstVisible(visibleStart(selected(), rows().length, settings().maxRows, firstVisible()));
}

function arm(reverse: boolean): void {
  if (reverse) {
    const next = windowsInRankOrder();
    setRows(next);
    setSelected(firstSelection(next.length > 0 ? next[0].pid : 0, D.frontmostPid(), next.length, true));
    followSelection();
    publishTarget();
  }
  if (rows().length === 0) { D.disarm(); D.refresh(); return; }
  setMode('picker');
  wheelRest = 0;
  armedAtFrame = frames;
  ui.repaint();
  D.showOverlay(settings().width, pickerHeight(rows().length));
  revealWhenStillHeld();
  D.refresh();
}
/** A quick press and release goes to the window with no list flashing on screen. Only the showing waits: the release raises the window at once either way. */
function revealWhenStillHeld(): void {
  const hold = ++holds;
  setTimeout(() => {
    if (hold === holds) reveal();
  }, REVEAL_DELAY_MS);
}
function reveal(): void {
  if (revealed || mode() !== 'picker') return;
  revealed = true;
  D.revealOverlay();
}
/** The wheel over the list: trackpads send fractions of a row. */
export function scrollList(wheel: number): void {
  wheelRest += wheel;
  const steps = Math.trunc(wheelRest);
  if (steps === 0) return;
  wheelRest -= steps;
  setFirstVisible(scrolledStart(firstVisible(), -steps, rows().length, settings().maxRows));
  setSelected(selectionInView(selected(), firstVisible(), settings().maxRows));
  publishTarget();
}
function move(step: number): void {
  if (mode() !== 'picker' || rows().length === 0) return;
  setSelected((selected() + step + rows().length) % rows().length);
  followSelection();
  publishTarget();
  if (frames - armedAtFrame >= FRAMES_BEFORE_REVEAL) reveal();   // a second press: the person is browsing, the list is wanted now
}
function endHold(): void {
  holds++;
  revealed = false;
  setMode('hidden');
  D.hideOverlay();
}
/** `alreadyRaised`: the tap went to the window on its own thread, and only the state is left to follow. */
function finishHold(alreadyRaised: boolean): void {
  if (mode() !== 'picker') return;
  const chosen = selected() < rows().length ? rows()[selected()] : null;
  D.disarm();
  endHold();
  if (chosen !== null) {
    orderBeforeRaise = recency.order.slice();
    raisedId = chosen.id;
    raisedAt = Date.now();
    recency.touch(chosen.id);
    if (!alreadyRaised) D.focusWindow(chosen.id, chosen.pid);
  }
  prepareList();
}
/** The bottom bar's way out: the hold ends with no window chosen, and the release that follows does nothing. */
export function leaveHold(): void {
  D.disarm();
  if (mode() === 'picker') endHold();
  prepareList();
}
export function pick(id: number): void {
  const list = rows();
  for (let i = 0; i < list.length; i++) if (list[i].id === id) setSelected(i);
  finishHold(false);
}
export function isSelected(id: number): boolean {
  return selected() < rows().length && rows()[selected()].id === id;
}
function cancel(): void {
  if (mode() !== 'picker') return;
  D.disarm();
  endHold();
  prepareList();
}

let onRecorded: (value: number) => void = (value: number) => {};
export function setRecordedHandler(handler: (value: number) => void): void { onRecorded = handler; }

function received(kind: number, value: number): void {
  if (kind === D.EVENT_ARM) arm(value === 1);
  else if (kind === D.EVENT_NEXT) move(1);
  else if (kind === D.EVENT_PREVIOUS) move(-1);
  else if (kind === D.EVENT_COMMIT) finishHold(value === 1);
  else if (kind === D.EVENT_CANCEL) cancel();
  else if (kind === D.EVENT_FOCUS) {
    if (focusIsStale(value, raisedId, Date.now() - raisedAt, FOCUS_SETTLE_MS)) return;
    recency.touch(value);
    if (mode() !== 'picker') prepareList();
    if (probing) console.log('focus ' + value);
  }
  else if (kind === D.EVENT_WINDOWS) applySweep();
  else if (kind === D.EVENT_RECORDED) onRecorded(value);
  else if (kind === D.EVENT_RAISE_FAILED) {   // it was never reached: it must not stay first
    recency.order = orderBeforeRaise;
    if (mode() !== 'picker') prepareList();
  }
}

export function startSwitching(): void {
  recency.order = restoreOrder(loadSavedOrder(), D.existingWindows());
  D.listen(received);
  D.setHotkey(settings().keyCode, settings().modifiers);
  if (D.isFake) applySweep();
  D.refresh();
  setInterval(() => { if (mode() !== 'picker') D.refresh(); }, SWEEP_EVERY_MS);
}

let frames = 0;
export function countFrame(): void { frames++; }
export function probeWindows(seconds: number): void {
  probing = true;
  console.log('accessibility: ' + D.hasPermission(false));
  D.start(false);
  setTimeout(() => {
    for (const w of windowsInRankOrder()) console.log('window ' + w.id + ' | ' + w.app + ' | ' + w.title + (w.offSpace ? ' | other Space' : '') + (w.minimized ? ' | minimized' : '') + (w.hidden ? ' | hidden' : ''));
    console.log('frames per second, window hidden: ' + Math.round(frames / seconds));
    quit();
  }, seconds * 1000);
}

/** What the T1 test and a capture look at: the picker with no hold going on. */
export function openPickerForCapture(): void { arm(false); }
