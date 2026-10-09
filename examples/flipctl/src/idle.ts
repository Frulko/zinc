// Idle screen, the root of the UI (flipctl-slint idle.slint): readings, hostname, one card per link.
import { rect } from 'zinc:gfx';
import { W, H, STATUS_BAR_H, WHITE, BLACK, DIVIDER, FIELD_LABEL } from './theme';
import { TITLE, text, tw, icon } from './panel';
import { drawStatusBar } from './statusbar';
import { drawSoftBar } from './softbar';
import { status } from './state';
import { Screen } from './screen';

export class Link { name: string; v4: string; v6: string; constructor(n: string, v4: string, v6: string) { this.name = n; this.v4 = v4; this.v6 = v6; } }

/** Label and value centred as one block. */
function pair(y: i32, label: string, value: string, gap: i32, labelDy: i32, labelInk: u32): void {
  const total = tw(TITLE, label) + (value === '' ? 0 : gap + tw(TITLE, value));
  const left = Math.floor((W - total) / 2);
  text(TITLE, left, y + labelDy, label, labelInk);
  text(TITLE, left + tw(TITLE, label) + gap, y + labelDy, value, BLACK);
}
function reading(x: i32, y: i32, tenths: i32): void {
  const n = Math.floor(tenths / 10) + '.' + Math.abs(tenths % 10);
  const wRef = tw(TITLE, '55.5');
  text(TITLE, x, y, n, BLACK);
  icon('degree_symbol', x + wRef + 1, y + 2, 4, 4, BLACK);
  text(TITLE, x + wRef + 1 + 4 + 1, y, 'C', BLACK);
}

export function drawIdle(links: Link[], scroll: i32, buttons: string[], slot: i32): void {
  const bar = STATUS_BAR_H;
  rect(0, 0, W, H, WHITE);
  drawStatusBar(false);
  rect(0, bar + 34, W, 1, DIVIDER);
  rect(0, bar + 48, W, 1, DIVIDER);
  rect(0, bar + 62, W, 1, DIVIDER);

  text(TITLE, 57, bar + 3, 'Temperature', FIELD_LABEL);
  icon('battery_vertical', 36, bar + 14, 9, 16, BLACK);
  reading(36 + 9 + 3, bar + 14 + 4, status.batteryTemp);
  icon('cpu_15px', 82, bar + 15, 15, 15, BLACK);
  reading(82 + 15 + 3, bar + 15 + 3, status.cpuTemp);

  text(TITLE, 163, bar + 3, 'Power flow', FIELD_LABEL);
  icon('power_usage', 162, bar + 15, 14, 15, BLACK);
  const mw = Math.abs(status.powerMw), h = Math.round((mw % 1000) / 10);
  text(TITLE, 162 + 14 + 3, bar + 15 + 3,
    (status.powerMw > 0 ? '+' : status.powerMw < 0 ? '-' : ' ') + Math.floor(mw / 1000) + '.' + (h < 10 ? '0' : '') + h + ' W', BLACK);

  pair(bar + 36, 'Profile:', status.profile, 4, 0, FIELD_LABEL);
  pair(bar + 49, 'Hostname:', status.hostname, 4, 1, FIELD_LABEL);

  const y0 = bar + 65, rows = Math.max(1, Math.floor((H - 14 - y0) / 26));
  for (let i = scroll; i < links.length && i < scroll + rows; i++) {
    const y = y0 + (i - scroll) * 26, l = links[i];
    const total = tw(TITLE, l.name) + 4 + tw(TITLE, 'IPv4:') + (l.v4 === '' ? 0 : 3 + tw(TITLE, l.v4));
    const x = Math.floor((W - total) / 2);
    text(TITLE, x, y, l.name, BLACK);
    text(TITLE, x + tw(TITLE, l.name) + 4, y, 'IPv4:', FIELD_LABEL);
    text(TITLE, x + tw(TITLE, l.name) + 4 + tw(TITLE, 'IPv4:') + 3, y, l.v4, BLACK);
    if (l.v6 !== '') pair(y + 12, 'IPv6:', l.v6, 3, 0, FIELD_LABEL);
  }
  drawSoftBar(buttons, slot);
}

/** The root screen; Enter opens the main menu. */
export class IdleScreen extends Screen {
  links: Link[]; scroll: i32 = 0; main: Screen;
  constructor(links: Link[], main: Screen) { super(); this.links = links; this.main = main; }
  move(d: i32): void { this.scroll = Math.min(Math.max(0, this.links.length - 1), Math.max(0, this.scroll + d)); }
  open(): Screen | null { return this.main; }
  draw(tick: i32): void { drawIdle(this.links, this.scroll, ['', '', '', '', 'Menu'], -1); }
}
