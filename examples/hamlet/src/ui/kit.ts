import {
  rect, line, loadFont, font, drawText, textWidth, lineHeight, createImage, beginImage, endImage, destroyImage, drawImage, width, height, setCursor, Cursor,
} from 'zinc:gfx';
import * as assets from 'zinc:assets';
import { drawGlyph } from './icons';
import { viewport } from './state';
import { sound } from '../audio';

// The pixel UI kit: carved stone and parchment, in the manner of the Sierra city builders. Colours are theme tokens (assets/ui-theme.json, one set per skin);
// frames and buttons are drawn once into small images (one per size and state, dropped when the skin or the window changes) and then cost one draw call.
const SKIN_COLORS: Map<string, number>[] = [];
const SKIN_NAMES: string[] = [];
export const kit = { skin: 0, small: -1 as i32, body: -1 as i32, big: -1 as i32, lineH: 16, ready: false };

function hex(text: string): number { return parseInt(text.slice(1), 16); }
export function loadKit(): void {
  const data: any = JSON.parse(assets.readText('ui-theme.json'));
  for (const s of data.skins as any[]) {
    const map = new Map<string, number>();
    for (const key of Object.keys(s.colors)) map.set(key, hex(s.colors[key] as string));
    SKIN_COLORS.push(map); SKIN_NAMES.push(String(s.label));
  }
  const name = String(data.font);
  kit.small = loadFont(name, 12); kit.body = loadFont(name, 14); kit.big = loadFont(name, 26);
  if (kit.small < 0) { kit.small = font('mono', 11); kit.body = font('mono', 14); kit.big = font('mono', 21); }
  kit.lineH = lineHeight(kit.body);
  kit.ready = true;
}
export function skinNames(): string[] { return SKIN_NAMES; }
export function setSkin(i: number): void { if (i !== kit.skin && i >= 0 && i < SKIN_COLORS.length) { kit.skin = i; dropImages(); } }
/** A theme colour (0xRRGGBB). */
export function col(name: string): number { return SKIN_COLORS[kit.skin].get(name) as number; }
function mix(a: number, b: number, t: number): number {
  const r = Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t), g = Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t), bl = Math.round((a & 255) * (1 - t) + (b & 255) * t);
  return (r << 16) | (g << 8) | bl;
}
export { mix };

// ---- cached images ----
const images = new Map<string, i32>();
function dropImages(): void { for (const image of images.values()) destroyImage(image); images.clear(); }
/** Draws a cached picture: `paint` runs once per (key, size, skin) between beginImage and endImage. */
function cached(key: string, x: number, y: number, w: number, h: number, paint: (w: number, h: number) => void): void {
  const full = kit.skin + ':' + key + ':' + w + 'x' + h;
  let image: i32 = images.has(full) ? images.get(full) as i32 : -1;
  if (image < 0) {
    image = createImage(w, h);
    beginImage(image); paint(w, h); endImage();
    images.set(full, image);
  }
  drawImage(image, x, y, w, h, 255, 0);
}
function grain(w: number, h: number, base: number, lightness: number, seed: number): void {
  rect(0, 0, w, h, base);
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
    const v = ((x * 73856093) ^ (y * 19349663) ^ (seed * 83492791)) >>> 0, r = v % 11;
    if (r === 0) rect(x, y, 2, 2, mix(base, 0xffffff, lightness)); else if (r === 1) rect(x, y, 2, 2, mix(base, 0x000000, lightness));
  }
}
function bevel(w: number, h: number, light: number, dark: number, n: number): void {
  rect(0, 0, w, n, light); rect(0, 0, n, h, light); rect(0, h - n, w, n, dark); rect(w - n, 0, n, h, dark);
}
function rivet(x: number, y: number): void { rect(x, y, 3, 3, col('goldDark')); rect(x, y, 2, 2, col('gold')); }

/** The carved stone slab that holds everything: a dark outline, a light chisel edge, a groove, rivets in the corners. */
export function slab(x: number, y: number, w: number, h: number): void {
  cached('slab', x, y, w, h, (w: number, h: number): void => {
    grain(w, h, col('stone'), .12, 1);
    bevel(w, h, col('stoneLight'), col('stoneDark'), 2);
    rect(0, 0, w, 1, col('stoneDeep')); rect(0, h - 1, w, 1, col('stoneDeep')); rect(0, 0, 1, h, col('stoneDeep')); rect(w - 1, 0, 1, h, col('stoneDeep'));
    if (w > 24 && h > 24) { rect(5, 5, w - 10, 1, col('stoneDark')); rect(5, h - 6, w - 10, 1, col('stoneLight')); rect(5, 5, 1, h - 10, col('stoneDark')); rect(w - 6, 5, 1, h - 10, col('stoneLight')); rivet(3, 3); rivet(w - 6, 3); rivet(3, h - 6); rivet(w - 6, h - 6); }
  });
}
/** A sheet of parchment (windows, tooltips, the message scroll). */
export function parchment(x: number, y: number, w: number, h: number): void {
  cached('parchment', x, y, w, h, (w: number, h: number): void => {
    grain(w, h, col('parchment'), .06, 2);
    rect(0, 0, w, 1, col('ink')); rect(0, h - 1, w, 1, col('ink')); rect(0, 0, 1, h, col('ink')); rect(w - 1, 0, 1, h, col('ink'));
    rect(2, 2, w - 4, 1, col('parchmentDark')); rect(2, h - 3, w - 4, 1, col('parchmentDark')); rect(2, 2, 1, h - 4, col('parchmentDark')); rect(w - 3, 2, 1, h - 4, col('parchmentDark'));
  });
}
/** A sunken well (the overview map, the bars behind numbers). */
export function well(x: number, y: number, w: number, h: number): void {
  cached('well', x, y, w, h, (w: number, h: number): void => {
    rect(0, 0, w, h, col('bar'));
    bevel(w, h, col('stoneDeep'), col('stoneLight'), 1);
  });
}
// ---- windows ----
// One behaviour for every window: a stone title bar that drags the window (its place is remembered per id, clamped in the viewport, forgotten when the
// window is resized), a close button, Esc for the topmost one. They are exclusive or stacked by draw order: the last drawn is on top and gets Esc first.
class WinRec { x: number = 0; y: number = 0; w: number = 0; h: number = 0; close: (() => void) | null = null; }
const winPos = new Map<string, number[]>();          // id -> [x, y] the player dragged it to
const winShown = new Map<string, WinRec>();          // id -> where it was drawn this frame
let winDrawn: string[] = [], winPrev: string[] = [], winSeenW = 0, winSeenH = 0, winGrab = '', winGrabDX = 0, winGrabDY = 0;
function winClamp(x: number, y: number, w: number, h: number): number[] {
  const vp = viewport();
  return [Math.max(vp.x, Math.min(vp.x + vp.w - w, x)), Math.max(vp.y, Math.min(vp.y + vp.h - Math.min(h, 40), y))];
}
/** Where a window stands: its dragged place when it has one, else the default. Call before drawing it. */
export function winOrigin(id: string, x: number, y: number, w: number, h: number): { x: number; y: number } {
  const p = winPos.get(id);
  if (p === undefined) return { x, y };
  const c = winClamp(p[0], p[1], w, h);
  return { x: c[0], y: c[1] };
}
/** A window on parchment with a stone title strip; with an id it also drags by the strip and closes with the [x] (`onClose`). */
export function window_(x: number, y: number, w: number, h: number, title: string, id: string = '', onClose: (() => void) | null = null): void {
  slab(x - 6, y - 6, w + 12, h + 12);
  parchment(x, y, w, h);
  rect(x, y, w, 22, col('stoneDark')); rect(x, y + 22, w, 1, col('stoneDeep'));
  text(kit.body, x + 8, y + 3, title, col('barText'));
  addHit('', x - 6, y - 6, w + 12, h + 12, '', Cursor.Default);       // the world below gets no click
  if (id === '') return;
  let rec = winShown.get(id);
  if (rec === undefined) { rec = new WinRec(); winShown.set(id, rec); }
  rec.x = x; rec.y = y; rec.w = w; rec.h = h; rec.close = onClose;
  if (winPrev.indexOf(id) < 0) sound('open', .5);
  winDrawn.push(id);
  addHit('win:drag:' + id, x, y, w - (onClose !== null ? 28 : 0), 22, '', Cursor.Grab);
  if (onClose !== null) glyphButton('win:close:' + id, x + w - 24, y + 2, 20, 18, 'close', 'Fermer');
}
/** A press on a window's title bar starts a drag. */
export function winDragStart(id: string, px: number, py: number): void {
  const rec = winShown.get(id);
  if (rec === undefined) return;
  winGrab = id; winGrabDX = px - rec.x; winGrabDY = py - rec.y;
}
export function winDragging(): boolean { return winGrab !== ''; }
export function winDragMove(px: number, py: number): void {
  const rec = winShown.get(winGrab);
  if (rec === undefined) return;
  winPos.set(winGrab, winClamp(px - winGrabDX, py - winGrabDY, rec.w, rec.h));
}
/** Ends a drag; true when a window was being dragged (its place is worth saving). */
export function winDragEnd(): boolean { const was = winGrab !== ''; winGrab = ''; return was; }
function winClose(id: string): boolean {
  const rec = winShown.get(id);
  if (rec === undefined || rec.close === null) return false;
  sound('close', .5); rec.close(); return true;
}
/** Esc: closes the topmost closable window drawn last frame. */
export function closeTopWindow(): boolean {
  for (let i = winDrawn.length - 1; i >= 0; i--) if (winClose(winDrawn[i])) return true;
  return false;
}
export function winClick(id: string): boolean { return id.startsWith('win:close:') && winClose(id.slice(10)); }
/** The dragged places, for the saved options. */
export function winExport(): any { const out: any = {}; for (const [id, p] of winPos) out[id] = p; return out; }
export function winImport(data: any): void {
  if (data === null || typeof data !== 'object') return;
  for (const id of Object.keys(data)) { const p = data[id]; if (Array.isArray(p) && p.length === 2 && typeof p[0] === 'number' && typeof p[1] === 'number') winPos.set(id, [p[0] as number, p[1] as number]); }
}

// ---- hit testing and widgets ----
export class Hit { x: number = 0; y: number = 0; w: number = 0; h: number = 0; id: string = ''; tip: string = ''; cursor: number = 0; }
export const hits: Hit[] = [];
export const pointer = { x: 0, y: 0, hover: '', down: '' };
export function beginFrame(): void {
  hits.length = 0; winPrev = winDrawn; winDrawn = [];
  if (width() !== winSeenW || height() !== winSeenH) { if (winSeenW > 0) winPos.clear(); winSeenW = width(); winSeenH = height(); }
}
export function addHit(id: string, x: number, y: number, w: number, h: number, tip: string = '', cursor: number = Cursor.Pointer): void {
  const hit = new Hit(); hit.id = id; hit.x = x; hit.y = y; hit.w = w; hit.h = h; hit.tip = tip; hit.cursor = cursor; hits.push(hit);
}
/** The topmost widget under a point (the last one drawn); null over the open map. */
export function hitAt(x: number, y: number): Hit | null {
  for (let i = hits.length - 1; i >= 0; i--) { const h = hits[i]; if (x >= h.x && y >= h.y && x < h.x + h.w && y < h.y + h.h) return h; }
  return null;
}
/** Which widget is hovered after the pointer moved; true when that changed (a redraw is due). */
export function track(x: number, y: number): boolean {
  pointer.x = x; pointer.y = y;
  const h = hitAt(x, y), id = h === null ? '' : h.id;
  if (id === pointer.hover) return false;
  pointer.hover = id; return true;
}
/** A panel that swallows clicks without being a button. */
export function block(x: number, y: number, w: number, h: number): void { addHit('', x, y, w, h, '', Cursor.Default); }

export function text(f: i32, x: number, y: number, s: string, color: number, shadow: boolean = false): void {
  if (shadow) drawText(f, x + 1, y + 1, s, col('stoneDeep'), 255, 0);
  drawText(f, x, y, s, color, 255, 0);
}
export function textR(f: i32, right: number, y: number, s: string, color: number): void { drawText(f, right - textWidth(f, s, 0), y, s, color, 255, 0); }
export function textC(f: i32, cx: number, y: number, s: string, color: number): void { drawText(f, cx - textWidth(f, s, 0) / 2, y, s, color, 255, 0); }
export function measure(s: string): number { return textWidth(kit.body, s, 0); }
/** Breaks a sentence into lines no wider than `w` pixels. */
export function wrap(s: string, w: number, f: i32 = -1): string[] {
  const font_ = f < 0 ? kit.body : f, out: string[] = [];
  let line_ = '';
  for (const word of s.split(' ')) {
    const next = line_ === '' ? word : line_ + ' ' + word;
    if (line_ !== '' && textWidth(font_, next, 0) > w) { out.push(line_); line_ = word; } else line_ = next;
  }
  if (line_ !== '') out.push(line_);
  return out;
}

export const BTN_NORMAL = 0, BTN_HOVER = 1, BTN_PRESSED = 2, BTN_DISABLED = 3, BTN_SELECTED = 4;
function buttonFace(state: number, x: number, y: number, w: number, h: number): void {
  cached('btn' + state, x, y, w, h, (w: number, h: number): void => {
    const base = state === BTN_DISABLED ? mix(col('stone'), col('disabled'), .5) : state === BTN_HOVER ? col('stoneLight') : state === BTN_SELECTED ? mix(col('stone'), col('gold'), .35) : col('stone');
    const pressed = state === BTN_PRESSED || state === BTN_SELECTED;
    grain(w, h, pressed ? mix(base, 0x000000, .12) : base, .1, 3);
    bevel(w, h, pressed ? col('stoneDark') : col('stoneLight'), pressed ? col('stoneLight') : col('stoneDark'), 2);
    rect(0, 0, w, 1, col('stoneDeep')); rect(0, h - 1, w, 1, col('stoneDeep')); rect(0, 0, 1, h, col('stoneDeep')); rect(w - 1, 0, 1, h, col('stoneDeep'));
    if (state === BTN_SELECTED) { rect(2, 2, w - 4, 1, col('gold')); rect(2, h - 3, w - 4, 1, col('gold')); rect(2, 2, 1, h - 4, col('gold')); rect(w - 3, 2, 1, h - 4, col('gold')); }
    if (state === BTN_DISABLED) for (let i = -h; i < w; i += 4) line(i, h, i + h, 0, col('stoneDark'));
  });
}
/** A bevelled button. Returns its state so the caller can place an icon or a label; registers its hit area. */
export function button(id: string, x: number, y: number, w: number, h: number, tip: string = '', enabled: boolean = true, selected: boolean = false): number {
  const state = !enabled ? BTN_DISABLED : pointer.down === id ? BTN_PRESSED : selected ? BTN_SELECTED : pointer.hover === id ? BTN_HOVER : BTN_NORMAL;
  buttonFace(state, x, y, w, h);
  addHit(id, x, y, w, h, tip, enabled ? Cursor.Pointer : Cursor.NotAllowed);
  return state;
}
/** A button with a label centred on it. */
export function labelButton(id: string, x: number, y: number, w: number, h: number, label: string, tip: string = '', enabled: boolean = true, selected: boolean = false): void {
  const s = button(id, x, y, w, h, tip, enabled, selected), dy = s === BTN_PRESSED ? 1 : 0;
  textC(kit.body, x + w / 2, y + (h - kit.lineH) / 2 + dy, label, enabled ? col('barText') : col('disabled'));
}
/** A button with a glyph centred on it. */
export function glyphButton(id: string, x: number, y: number, w: number, h: number, glyph: string, tip: string = '', enabled: boolean = true, selected: boolean = false): void {
  const s = button(id, x, y, w, h, tip, enabled, selected), d = Math.min(w, h) - 8, dy = s === BTN_PRESSED ? 1 : 0;
  drawGlyph(glyph, x + (w - d) / 2, y + (h - d) / 2 + dy, d);
}
/** A horizontal bar (jobs filled, stock level) in a well. */
export function meter(x: number, y: number, w: number, h: number, fraction: number, color: number): void {
  well(x, y, w, h);
  const f = Math.max(0, Math.min(1, fraction));
  if (f > 0) rect(x + 2, y + 2, Math.max(1, Math.floor((w - 4) * f)), h - 4, color);
}

// ---- tooltip and cursor ----
/** The tooltip of the hovered widget: a parchment note by the pointer, kept inside the window. */
export function drawTooltip(): void {
  const h = hitAt(pointer.x, pointer.y);
  if (h === null || h.tip === '') return;
  const lines: string[] = [];
  for (const raw of h.tip.split('\n')) for (const part of wrap(raw, 340)) lines.push(part);
  let w = 0;
  for (const l of lines) w = Math.max(w, measure(l));
  w += 16; const th = lines.length * kit.lineH + 10;
  const x = Math.max(4, Math.min(width() - w - 4, pointer.x + 14)), y = Math.max(4, Math.min(height() - th - 4, pointer.y + 18));
  parchment(x, y, w, th);
  for (let i = 0; i < lines.length; i++) text(kit.body, x + 8, y + 5 + i * kit.lineH, lines[i], i === 0 ? col('accent') : col('ink'));
}
/** The cursor over a widget is the pointing hand (or the barred circle when the widget is off); over the map `fallback` says what the tool shows. */
export function updateCursor(fallback: number): void {
  const h = hitAt(pointer.x, pointer.y);
  setCursor(h === null ? fallback : h.cursor);
}
