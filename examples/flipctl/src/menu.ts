// Menu list (flipctl-slint list.slint): five 20 px rows, a chamfered selector, a dotted scrollbar.
import { rect } from 'zinc:gfx';
import { W, LIST_X, LIST_Y, LIST_ROWS, SUB_Y, CRUMB_X, CRUMB_Y, MENU_LINE_H, MENU_LINE_W, SELECTOR_X, SELECTOR_W_SCROLL,
  SELECTOR_W_FULL, SELECTOR_H, SELECTOR_DY, MENU_R, SCROLL_X, SCROLL_Y, SCROLL_H, ICON_FRAME_MS, BLACK, WHITE, DIVIDER, STATUS_DIM } from './theme';
import { TITLE, ROW, ROW_ACTIVE, text, textRight, tw, frame, strip, drawScrollbar } from './panel';
import { drawStatusBar } from './statusbar';
import { drawSoftBar } from './softbar';
import { Screen } from './screen';
import { pageFor } from './page';

export class Item {
  label: string; icon: string; frames: i32; status: string; sub: i32;
  choices: string[] = [];   // Left / Right cycle the status through these (a toggle row)
  constructor(label: string, icon: string, frames: i32, status: string, sub: i32) {
    this.label = label; this.icon = icon; this.frames = frames; this.status = status; this.sub = sub;
  }
}
/** A screen of rows; `crumb` is the "> Network" trail of a submenu ('' for the main menu). */
export class Menu extends Screen {
  crumb: string; items: Item[]; selected: i32 = 0; scroll: i32 = 0; subs: Menu[] = [];
  constructor(crumb: string, items: Item[]) { super(); this.crumb = crumb; this.items = items; }
  open(): Screen | null {
    const it = this.items[this.selected];
    if (it.sub >= 0) return this.subs[it.sub];
    return it.choices.length > 0 ? null : pageFor(it.label);
  }
  draw(tick: i32): void { drawMenu(this, false, tick, [this.crumb === '' ? 'Home' : 'Back', '', '', '', 'Open'], -1); }
  cycle(d: i32): void {
    const it = this.items[this.selected], n = it.choices.length;
    if (n > 0) it.status = it.choices[(it.choices.indexOf(it.status) + d + n) % n];
  }
  move(d: i32): void {
    const n = this.items.length;
    // a single step wraps; paging and Home / End clamp
    this.selected = d === 1 || d === -1 ? (this.selected + d + n) % n : Math.min(n - 1, Math.max(0, this.selected + d));
    if (this.selected < this.scroll) this.scroll = this.selected;
    if (this.selected >= this.scroll + LIST_ROWS) this.scroll = this.selected - LIST_ROWS + 1;
  }
}

function drawRow(it: Item, y: i32, selected: boolean, pressed: boolean, tick: i32): void {
  const active = selected || pressed;
  const ink: u32 = pressed ? WHITE : BLACK;
  if (it.icon !== '') {
    const frame = active && it.frames > 1 ? (tick + 1) % it.frames : 0;
    strip(it.icon, LIST_X + 3, y + 3, 14, 14, it.frames, frame, ink);
  }
  text(active ? ROW_ACTIVE : ROW, LIST_X + 3 + 14 + 4, y + (active ? 2 : 3), it.label, ink);
  if (it.status !== '') textRight(ROW, LIST_X + MENU_LINE_W - 5, y + 3, it.status, pressed ? WHITE : selected ? BLACK : STATUS_DIM);
}

export function drawMenu(m: Menu, pressed: boolean, tick: i32, buttons: string[], slot: i32): void {
  rect(0, 0, W, 144, WHITE);
  drawStatusBar(false);
  const top = m.crumb === '' ? LIST_Y : SUB_Y;
  const scrolls = m.items.length > LIST_ROWS;
  const selW = scrolls ? SELECTOR_W_SCROLL : SELECTOR_W_FULL;
  const selY = top + (m.selected - m.scroll) * (MENU_LINE_H + 1) + SELECTOR_DY;
  if (m.crumb !== '') text(TITLE, CRUMB_X, CRUMB_Y, m.crumb, DIVIDER);
  if (pressed) frame(SELECTOR_X, selY, selW, SELECTOR_H, MENU_R, true, false, false);
  for (let i = m.scroll; i < m.items.length && i < m.scroll + LIST_ROWS; i++) {
    const y = top + (i - m.scroll) * (MENU_LINE_H + 1);
    drawRow(m.items[i], y, i === m.selected, i === m.selected && pressed, tick);
    if (i > m.scroll) rect(SELECTOR_X + MENU_R, y - 1, selW - 2 * MENU_R, 1, DIVIDER);
  }
  frame(SELECTOR_X, selY, selW, SELECTOR_H, MENU_R, false, true, true);
  if (scrolls) drawScrollbar(m.items.length, LIST_ROWS, m.scroll);
  drawSoftBar(buttons, slot);
}
