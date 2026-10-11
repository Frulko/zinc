// The screen layouts: the window of the game as one of the table's two layouts fills it, drawn by the game's own code (the table in
// its box as the layout's eye sees it, the score panel with its picture and its items), with the box of each thing of the panel
// over it. It takes the place of the top view while a layout, or something in one, is selected. A click takes an item of the
// panel, the panel itself or the box the table is drawn in; a drag moves it, the square at its corner sizes it; the wheel over the
// table narrows or widens the eye's field of view. The other properties are in the form at the right. Each layout is edited by
// itself: the switch above goes from one to the other.
import { createEffect } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { rect, border, clip, unclip, font, drawText, textWidth } from 'zinc:gfx';
import { Camera } from 'zinc:3d';
import { Game } from '../../pinball3d/src/game';
import { View } from '../../pinball3d/src/view';
import { drawPanel } from '../../pinball3d/src/panel';
import { rgb } from './shapes';
import { doc, table, selected, select, dragRow } from './state';
import { fieldAt } from './doc';
import { sceneNow, tableNow, aim } from './play';
import { Heading, Segmented, ACCENT } from './widgets';
import * as L from './strings';
import { t, fieldName } from './strings';

/** Whether the selection is a screen layout or something in one: the layouts are then shown instead of the top view. */
export function screenShown(): boolean { return selected() === 'layouts' || selected().startsWith('layouts.'); }
/** The layout being edited: the one the selection is in, landscape before one is chosen. */
function layoutName(): string { return selected().startsWith('layouts.portrait') ? 'portrait' : 'landscape'; }
function itemPath(i: i32): string { return `layouts.${layoutName()}.panel.items[${i}]`; }
/** The boxes of the layout that are taken, moved and sized here, each by the path of what is selected with it: the things of the
 *  panel (their `box`), then the panel (its `box`, when it has one) and the layout itself (its `view`: where the table is drawn). */
function boxPaths(): string[] {
  const l = layoutName(), both = table().layouts, p = (l === 'portrait' ? both.portrait : both.landscape).panel, out: string[] = [];
  for (let i = 0; i < p.items.length; i++) out.push(`${itemPath(i)}.box`);
  if (p.box[2] > 0 && p.box[3] > 0) out.push(`layouts.${l}.panel.box`);
  out.push(`layouts.${l}.view`);
  return out;
}
/** What is selected with a box: the object that holds it. */
function ownerOf(box: string): string { return box.slice(0, box.lastIndexOf('.')); }
function boxAt(path: string): number[] { const b: any = doc().get(path); return [b[0], b[1], b[2], b[3]]; }

const MARGIN = 28;
const eye = new Camera();
// the game the panel is drawn for: one that waits for a player, made again when the table changes (it makes no sound)
let waiting: Game | null = null, waitingFor: any = null;
function gameFor(): Game {
  const d = doc().data;
  if (waiting === null || waitingFor !== d) {
    if (waiting !== null) waiting.physics.destroy();
    waiting = new Game(tableNow());
    waitingFor = d;
  }
  return waiting as Game;
}
/** The layout placed in a pane of this size: its window whole, with a margin. */
function placed(w: number, h: number): View {
  const v = new View(table(), w - 2 * MARGIN, h - 2 * MARGIN, layoutName());
  v.ox += MARGIN; v.oy += MARGIN;
  return v;
}
let TAG: i32 = -1;
// the pane's size, as it was last drawn: the pointer is read against the same placing
let paneW: number = 800, paneH: number = 760;

function draw(x: i32, y: i32, w: i32, h: i32): void {
  if (TAG < 0) TAG = font('sans-bold', 10);
  paneW = w; paneH = h;
  const tb = table(), v = placed(w, h), l = v.layout, chosen = selected();
  v.ox += x; v.oy += y;
  clip(x, y, w, h);
  rect(v.ox, v.oy, Math.round(l.window[0] * v.scale), Math.round(l.window[1] * v.scale), rgb(tb.lighting.background));
  try {
    aim(eye, l, v.w(l.view), v.h(l.view));
    eye.render(sceneNow().scene, v.x(l.view), v.y(l.view), v.w(l.view), v.h(l.view));
    drawPanel(v, gameFor(), t(L.KEYS_OF_GAME));
  } catch (e) { }   // a table that cannot be shown in 3D still has its layout: the boxes below
  const all = boxPaths();
  for (let k = all.length - 1; k >= 0; k--) {   // the table's box and the panel's first: the things of the panel are over them
    const b = boxAt(all[k]), on = chosen === ownerOf(all[k]), bx = v.x(b), by = v.y(b), bw = v.w(b), bh = v.h(b), item = k < l.panel.items.length;
    if (!item && !on) { if (all[k].endsWith('.view')) border(bx, by, bw, bh, 0, 1, 0x52525b, 255); continue; }
    border(bx, by, bw, bh, 2, on ? 2 : 1, on ? ACCENT : 0x71717a, on ? 255 : 150);
    // what it is, on its edge (a thing of the panel: what it shows; the table's box: with the eye's field of view); the square
    // that sizes the chosen one
    const name = item ? l.panel.items[k].show : all[k].endsWith('.view') ? `${fieldName('view')}   ${l.camera.fov}°` : fieldName('panel'), tw = textWidth(TAG, name, 0);
    rect(bx + bw - tw - 8, by - 7, tw + 8, 14, on ? ACCENT : 0x27272a);
    drawText(TAG, bx + bw - tw - 4, by - 6, name, on ? 0x18181b : 0xa1a1aa, 255, 0);
    if (on) { rect(bx + bw - 5, by + bh - 5, 10, 10, 0x18181b); rect(bx + bw - 4, by + bh - 4, 8, 8, ACCENT); }
  }
  unclip();
}

// the box being moved or sized, by its path ('' for none)
let held = '', sizing = false, pressX: number = 0, pressY: number = 0, from: number[] = [], wheelSum: number = 0;
function down(e: ui.PointerEvent): void {
  if (e.button !== 0) return;
  const v = placed(paneW, paneH);
  held = '';
  // the square of the chosen box first; then the smallest box the pointer is in (a caption lies inside the box of its line, the
  // things of the panel inside the panel)
  let area = 1e12;
  for (const path of boxPaths()) {
    const b = boxAt(path), bx = v.x(b), by = v.y(b), bw = v.w(b), bh = v.h(b);
    if (selected() === ownerOf(path) && Math.abs(e.x - bx - bw) < 8 && Math.abs(e.y - by - bh) < 8) { held = path; sizing = true; area = 0; }
    else if (e.x >= bx && e.x <= bx + bw && e.y >= by && e.y <= by + bh && bw * bh < area) { held = path; sizing = false; area = bw * bh; }
  }
  if (held === '') { select(`layouts.${layoutName()}`); return; }
  from = boxAt(held);
  pressX = e.x; pressY = e.y;
  if (selected() !== ownerOf(held)) select(ownerOf(held));
  doc().seal();
}
function move(e: ui.PointerEvent): void {
  if (held === '' || Math.abs(e.x - pressX) + Math.abs(e.y - pressY) < 4) return;
  // in the pixels of the layout's own window, by steps of 2 (1 with Alt)
  const v = placed(paneW, paneH), grain = e.alt ? 1 : 2;
  const dx = Math.round((e.x - pressX) / v.scale / grain) * grain, dy = Math.round((e.y - pressY) / v.scale / grain) * grain;
  dragRow(held, sizing ? [from[0], from[1], Math.max(8, from[2] + dx), Math.max(8, from[3] + dy)] : [from[0] + dx, from[1] + dy, from[2], from[3]]);
}
function up(e: ui.PointerEvent): void { held = ''; doc().seal(); }
/** The wheel over the box of the table: the eye's field of view, a degree a notch (towards the table narrows it: the table comes
 *  closer), within the limits of the format. The notches that follow one another are one step for undo. */
function wheel(e: ui.PointerEvent): void {
  const v = placed(paneW, paneH), b = v.layout.view, path = `layouts.${layoutName()}.camera.fov`, fd = fieldAt(path);
  if (fd === null || e.x < v.x(b) || e.x > v.x(b) + v.w(b) || e.y < v.y(b) || e.y > v.y(b) + v.h(b)) return;
  wheelSum += e.wheel;
  if (Math.abs(wheelSum) < 1) return;
  const by = wheelSum > 0 ? -1 : 1;
  wheelSum = 0;
  dragRow(path, Math.max(fd.min, Math.min(fd.max, v.layout.camera.fov + by)));
}

export function ScreenView(): i32 {
  createEffect(() => { doc(); selected(); ui.repaint(); });
  return <view class="grow basis-0 min-w-0 flex-col">
    <view class="flex-row items-center gap-3 h-9 px-3 shrink-0 bg-zinc-900 border-b border-zinc-800">
      <Heading label={t(L.SCREEN_VIEW)} />
      <view class="w-[190]"><Segmented options={['landscape', 'portrait']} labels={[t(L.LANDSCAPE_LAYOUT), t(L.PORTRAIT_LAYOUT)]} value={layoutName} onPick={(v: string) => select(`layouts.${v}`)} /></view>
      <text class="grow basis-0 truncate text-[11px] text-zinc-500">{t(L.SCREEN_HOW)}</text>
    </view>
    <view class="grow basis-0 min-h-0 relative overflow-hidden bg-zinc-950 cursor-default" onPointerDown={down} onPointerMove={move} onPointerUp={up} onWheel={wheel}>
      <canvas class="absolute inset-0" style={{ lazy: 1 }} onDraw={draw} />
    </view>
  </view>;
}
