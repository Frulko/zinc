// The drawing kit of the app: Apple's dark palette, Inter, touch zones registered while drawing, sliders, scrolling lists, Lucide icons
// drawn once into pictures, and pictures fetched from the network. Immediate mode with zinc:gfx: a frame is drawn only when something
// changed (`ui.dirty`), which keeps the TouchPad's GPU and CPU idle most of the time.
import { rrect, rect, gradient, drawImageRect, drawText, textWidth, font, fontAscent, drawImage, imageFromBytes, destroyImage, createImage, beginImage, endImage, clip, unclip, imageWidth, imageHeight, shadow, polygon, stroke } from 'zinc:gfx';
import { icon } from 'zinc:icons';

// ---------------------------------------------------------------- palette (iOS dark) and type
export const BG = 0x000000, CARD = 0x1c1c1e, CARD2 = 0x2c2c2e, FILL = 0x3a3a3c, SEP = 0x38383a;
export const TEXT = 0xffffff, TEXT2 = 0x98989f, TEXT3 = 0x636366;
export const ACCENT = 0xfa2d48, GREEN = 0x1ed760, BLUE = 0x0a84ff;

export const F = {
  hero: font('sans-bold', 34), title: font('sans-bold', 28), head: font('sans-bold', 22), body: font('sans', 20), bodyB: font('sans-bold', 18),
  label: font('sans', 17), small: font('sans', 15), smallB: font('sans-bold', 15), tiny: font('sans', 13), tinyB: font('sans-bold', 12), key: font('sans', 24),
};

// ---------------------------------------------------------------- state shared with main.ts
export class State {
  dirty: boolean = true;
  /** The pointer as main.ts read it this frame. */
  x: number = 0;
  y: number = 0;
  /** The zone under the finger since it went down ('' none), for the pressed look. */
  pressed: string = '';
  /** Added to the zones registered now: the pages are drawn under the status bar, moved down by a transform, and the home's slides
   *  moved sideways by the carousel. */
  ox: number = 0;
  oy: number = 0;
  /** Set while drawing something that moves by itself (a spinner, a picture fading in): the next frame is drawn too. */
  animating: boolean = false;
}
export const ui = new State();

// ---------------------------------------------------------------- zones: what a touch does, registered while drawing
export class Zone {
  id: string = '';
  x: number = 0; y: number = 0; w: number = 0; h: number = 0;
  tap: (() => void) | null = null;
  /** A drag (a slider): called with the finger's x, y and 0 down, 1 move, 2 up. */
  drag: ((x: number, y: number, phase: i32) => void) | null = null;
  scroll: Scroll | null = null;
  inside(px: number, py: number): boolean { return px >= this.x && px < this.x + this.w && py >= this.y && py < this.y + this.h; }
}
export let zones: Zone[] = [];
/** Called at the start of a drawn frame: the zones of the new frame replace the old ones. */
export function resetZones(): void { zones = []; }

export function onTap(id: string, x: number, y: number, w: number, h: number, tap: () => void): void {
  const z = new Zone(); z.id = id; z.x = x + ui.ox; z.y = y + ui.oy; z.w = w; z.h = h; z.tap = tap; zones.push(z);
}
export function onDrag(id: string, x: number, y: number, w: number, h: number, drag: (x: number, y: number, phase: i32) => void): void {
  const ox = ui.ox, oy = ui.oy;   // the offsets of this frame: the drag is called later, with the transform reset
  const z = new Zone(); z.id = id; z.x = x + ox; z.y = y + oy; z.w = w; z.h = h; z.drag = (px: number, py: number, phase: i32) => drag(px - ox, py - oy, phase); zones.push(z);
}
/** The topmost zone under a point (the last registered wins), skipping scroll areas when `taps` is true. */
export function zoneAt(px: number, py: number, taps: boolean): Zone | null {
  for (let i = zones.length - 1; i >= 0; i--) {
    const z = zones[i];
    if (z.inside(px, py) && (taps ? z.scroll === null : z.scroll !== null)) return z;
  }
  return null;
}
export function isPressed(id: string): boolean { return ui.pressed === id; }

// ---------------------------------------------------------------- scrolling
export class Scroll {
  y: number = 0;
  /** The height of the content, set by the page while drawing. */
  content: number = 0;
  view: number = 0;
  vel: number = 0;
  max(): number { return Math.max(0, this.content - this.view); }
  clamp(): void { this.y = Math.max(0, Math.min(this.max(), this.y)); }
  /** Inertia after a fling; true while it moves. */
  step(dt: number): boolean {
    if (Math.abs(this.vel) < 8) { this.vel = 0; return false; }
    this.y += this.vel * dt; this.vel *= Math.pow(0.04, dt);
    if (this.y < 0 || this.y > this.max()) { this.clamp(); this.vel = 0; }
    return true;
  }
}
/** Declares a scrolling area for this frame and clips to it; end with endScroll(). Content is drawn at y - s.y. */
export function beginScroll(s: Scroll, x: number, y: number, w: number, h: number): void {
  const z = new Zone(); z.id = 'scroll'; z.x = x + ui.ox; z.y = y + ui.oy; z.w = w; z.h = h; z.scroll = s; zones.push(z);
  s.view = h;
  clip(x, y, w, h);
}
export function endScroll(): void { unclip(); }

// ---------------------------------------------------------------- text
/** The text cut with an ellipsis to fit the width. */
export function fit(f: i32, s: string, w: number): string {
  if (textWidth(f, s, 0) <= w) return s;
  let lo = 0, hi = s.length;
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2) as i32; if (textWidth(f, s.slice(0, mid) + '…', 0) <= w) lo = mid; else hi = mid - 1; }
  return s.slice(0, lo).trimEnd() + '…';
}
// Tabular figures (owner, 2026-10-15): every digit takes the width of the widest one, so a clock does not shift as its digits change.
// Done here, a cell per character; the engine's own font feature (OpenType tnum) is a line of next/backlog/later.md.
const cellOf = new Map<i32, number>();
function digitCell(f: i32): number {
  const c = cellOf.get(f);
  if (c !== undefined) return c as number;
  let w = 0;
  for (let d = 0; d < 10; d++) w = Math.max(w, textWidth(f, '' + d, 0));
  cellOf.set(f, w);
  return w;
}
/** The width of `s` with tabular digits. */
export function tabularWidth(f: i32, s: string): number {
  let w = 0;
  const cell = digitCell(f);
  for (let i = 0; i < s.length; i++) { const ch = s.charAt(i); w += ch >= '0' && ch <= '9' ? cell : textWidth(f, ch, 0); }
  return w;
}
/** Text with its top at y and tabular digits, from x; the width used. */
export function tabular(f: i32, x: number, y: number, s: string, color: u32, alpha: i32 = 255): number {
  const cell = digitCell(f);
  let px = x;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charAt(i), digit = ch >= '0' && ch <= '9', w = textWidth(f, ch, 0);
    drawText(f, digit ? px + (cell - w) / 2 : px, y, ch, color, alpha, 0);
    px += digit ? cell : w;
  }
  return px - x;
}
/** Draws text with its top at y (not its baseline), cut to the width. */
export function label(f: i32, x: number, y: number, s: string, color: u32, w: number = 10000, alpha: i32 = 255): void {
  drawText(f, x, y, fit(f, s, w), color, alpha, 0);
}
export function centered(f: i32, cx: number, y: number, s: string, color: u32, alpha: i32 = 255): void {
  drawText(f, cx - textWidth(f, s, 0) / 2, y, s, color, alpha, 0);
}
/** Up to `lines` lines broken at spaces, the last one cut; the height used. */
export function wrap(f: i32, x: number, y: number, s: string, color: u32, w: number, lines: i32, lh: number): number {
  const words = s.split(' ');
  let line = '', n: i32 = 0;
  for (let i = 0; i < words.length; i++) {
    const t = line === '' ? words[i] : line + ' ' + words[i];
    if (textWidth(f, t, 0) <= w || line === '') { line = t; continue; }
    if (n === lines - 1) { line = words.slice(i - (line.split(' ').length)).join(' '); break; }
    drawText(f, x, y + n * lh, line, color, 255, 0); n++; line = words[i];
  }
  if (line !== '') { drawText(f, x, y + n * lh, fit(f, line, w), color, 255, 0); n++; }
  return n * lh;
}
export function clock(s: number): string {
  const t = Math.max(0, Math.floor(s)) as i32, m = Math.floor(t / 60) as i32, r = t % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

// ---------------------------------------------------------------- icons: Lucide, parsed once per colour and drawn as vectors
// (a runtime image is opaque black, so icons cannot be cached as pictures).
export function glyph(name: string, x: number, y: number, size: number, color: u32, alpha: i32 = 255, stroke: number = 2): void {
  const svg = icon(name, color as i32, stroke);
  if (svg !== null) svg.draw(x + ui.ox, y + ui.oy, size, size, alpha);   // ponytail: zinc:svg ignores setTransform, the offset is added here (later.md)
}
/** A filled glyph drawn as polygons, crisper than strokes for the transport buttons. */
export function transport(kind: string, cx: number, cy: number, s: number, color: u32): void {
  if (kind === 'play') { polygon([cx - s * 0.38, cy - s * 0.5, cx + s * 0.5, cy, cx - s * 0.38, cy + s * 0.5], color, 255); return; }
  if (kind === 'pause') { rrect(cx - s * 0.42, cy - s * 0.5, s * 0.3, s, s * 0.08, color, 255); rrect(cx + s * 0.12, cy - s * 0.5, s * 0.3, s, s * 0.08, color, 255); return; }
  if (kind === 'next' || kind === 'prev') {
    const d = kind === 'next' ? 1 : -1, h = s * 0.42;
    polygon([cx - d * s * 0.5, cy - h, cx, cy, cx - d * s * 0.5, cy + h], color, 255);
    polygon([cx, cy - h, cx + d * s * 0.5, cy, cx, cy + h], color, 255);
    rrect(kind === 'next' ? cx + s * 0.5 : cx - s * 0.5 - s * 0.1, cy - h, s * 0.1, h * 2, 1, color, 255);
  }
}

// ---------------------------------------------------------------- pictures from the network
// Lazy and never in the way of a frame: a picture is downloaded when it is first drawn (or prefetched while nobody touches the screen),
// and its bytes wait in a queue; decodeOne() turns one of them into an image per frame, never while a finger is down or a list moves,
// because decoding a 300 px cover takes 15 to 40 ms on the TouchPad's CPU (measured 2026-10-15).
const pics = new Map<string, i32>();
const loading = new Map<string, boolean>();
const lastDrawn = new Map<string, number>();
const bornAt = new Map<string, number>();   // when each picture was decoded: it fades in over FADE_MS
const FADE_MS = 220;   // when each picture was last asked for: the least recently drawn one leaves first
let tick = 0;
/** Once a frame (main.ts): the clock of lastDrawn. */
export function picturesTick(): void { tick++; }
const ready: string[] = [], readyLater: string[] = [];   // downloaded, to decode: drawn ones first, prefetched ones after
const bytesOf = new Map<string, u8[]>();
let inflight: i32 = 0;
let decodeMs = 0, decodes = 0;
/** Pictures decoded so far and the milliseconds it took (measuring). */
export function decodeStats(): number[] { return [decodes, decodeMs]; }
// Memory (owner, 2026-10-15: Musique went over webOS's quota, 111 MB): 60 pictures at most, none larger than 400 px a side (radio
// logos come at 1000 px and more, Spotify's at 640), the least recently drawn ones destroyed first.
const MAX_PICS = 60, MAX_INFLIGHT = 4, MAX_SIDE = 400;

/** The picture at this URL, or -1 while it loads (the frame is redrawn when it arrives) or when it cannot be read. */
export function picture(url: string): i32 {
  if (url === '') return -1;
  const p = pics.get(url);
  if (p !== undefined) { lastDrawn.set(url, tick); return p; }
  if (loading.get(url) === undefined && inflight < MAX_INFLIGHT) fetchPicture(url, true);
  return -1;
}
/** Downloads a picture before it is drawn, when the network is idle; false when there is no room for it now. */
export function prefetch(url: string): boolean {
  if (url === '' || pics.get(url) !== undefined || loading.get(url) !== undefined) return true;
  if (inflight >= 1 || pics.size + ready.length + readyLater.length >= MAX_PICS - 20) return false;
  fetchPicture(url, false);
  return true;
}
async function fetchPicture(url: string, drawn: boolean): Promise<void> {
  loading.set(url, true); inflight++;
  try {
    const r = await fetch(url, { timeoutMs: 10000, headers: [['User-Agent', 'ZincMusic/1.0']] });
    if (r.status === 200) { bytesOf.set(url, await r.bytes()); if (drawn) ready.push(url); else readyLater.push(url); }
    else pics.set(url, -1);
  } catch (e) { pics.set(url, -1); }
  inflight--;
}
/** Decodes one downloaded picture; true when one was made (the frame must be drawn again). */
export function decodeOne(): boolean {
  const url = ready.length > 0 ? ready.shift() as string : readyLater.length > 0 ? readyLater.shift() as string : '';
  if (url === '') return false;
  const b = bytesOf.get(url);
  bytesOf.delete(url);
  const t = performance.now();
  const img = b !== undefined ? smaller(imageFromBytes(b as u8[])) : -1;
  decodeMs += performance.now() - t; decodes++;
  if (pics.size >= MAX_PICS) {   // the least recently drawn picture leaves; it is fetched again if a page shows it later
    let old = '', at = tick + 1;
    pics.forEach((v: i32, k: string) => { const d = lastDrawn.get(k); const w = d !== undefined ? d : -1; if (w < at) { at = w; old = k; } });
    const o = pics.get(old);
    if (o !== undefined && o >= 0) destroyImage(o);
    pics.delete(old); loading.delete(old); lastDrawn.delete(old); bornAt.delete(old);
  }
  pics.set(url, img); lastDrawn.set(url, tick); bornAt.set(url, performance.now());
  return true;
}
/** A picture larger than MAX_SIDE drawn into one that is not (proportions kept), the large one destroyed. */
function smaller(img: i32): i32 {
  if (img < 0) return img;
  const iw = imageWidth(img), ih = imageHeight(img);
  if (iw <= MAX_SIDE && ih <= MAX_SIDE) return img;
  const k = MAX_SIDE / Math.max(iw, ih), w = Math.max(1, Math.round(iw * k)) as i32, h = Math.max(1, Math.round(ih * k)) as i32;
  const out = createImage(w, h);
  if (out < 0) return img;
  beginImage(out); drawImage(img, 0, 0, w, h, 255, 0); endImage();
  destroyImage(img);
  return out;
}
/** Draws a picture into the box keeping its proportions (contain), or nothing yet. */
export function drawFit(img: i32, x: number, y: number, w: number, h: number, radius: number): void {
  const iw = imageWidth(img), ih = imageHeight(img);
  if (iw <= 0 || ih <= 0) return;
  const k = Math.min(w / iw, h / ih), dw = iw * k, dh = ih * k;
  drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh, 255, radius);
}

/** How far a picture has faced in, 0..255 (255 once done). */
function fadeOf(url: string): i32 {
  const b = bornAt.get(url);
  if (b === undefined) return 255;
  const a = (performance.now() - (b as number)) / FADE_MS;
  if (a >= 1) { bornAt.delete(url); return 255; }
  ui.animating = true;
  return Math.round(a * 255) as i32;
}
/** A cover: the picture when it is there (fading in over the tile when it just arrived), else a tile with a gradient picked from the name
 *  and its initials (a note without a name). */
export function cover(url: string, name: string, x: number, y: number, s: number, radius: number, logo: boolean = false): void {
  const img = picture(url);
  const a = img >= 0 ? fadeOf(url) : 0;
  if (img >= 0 && a === 255 && !logo) { drawImage(img, x, y, s, s, 255, radius); return; }
  if (img >= 0 && logo) { rrect(x, y, s, s, radius, 0xf2f2f7, a); drawFit(img, x + s * 0.14, y + s * 0.14, s * 0.72, s * 0.72, 4); return; }
  if (img >= 0) { rrect(x, y, s, s, radius, CARD2, 255); drawImage(img, x, y, s, s, a, radius); return; }
  if (name === '') { rrect(x, y, s, s, radius, CARD2, 255); glyph('music', x + s * 0.3, y + s * 0.3, s * 0.4, TEXT3); return; }
  const tints: u32[] = [0xfa2d48, 0xff9f0a, 0x30d158, 0x0a84ff, 0xbf5af2, 0xff375f, 0x64d2ff, 0xffd60a];
  let h: i32 = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  const c = tints[h % tints.length];
  gradient(x, y, s, s, radius, c, ((c >> 1) & 0x7f7f7f) + 0x101010, true, 255);   // the tint, darkening downwards
  const words = name.split(' ').filter((w: string) => w.length > 0);
  const initials = (words.length > 1 ? words[0].charAt(0) + words[1].charAt(0) : name.slice(0, 2)).toUpperCase();
  const f = s >= 120 ? F.hero : F.bodyB;
  centered(f, x + s / 2, y + s / 2 - fontAscent(f) / 2 - 2, initials, 0xffffff);
}

/** A soft copy of a picture: drawn at 12x12 and stretched back with linear sampling, the blurred and darkened backdrop of the player. */
let blurFor = '', blurImg: i32 = -1;
export function backdrop(url: string, W: number, H: number): boolean {
  const img = picture(url);
  if (img < 0) return false;
  if (blurFor !== url) {
    if (blurImg < 0) blurImg = createImage(12, 12);
    beginImage(blurImg); drawImage(img, 0, 0, 12, 12, 255, 0); endImage();
    blurFor = url;
  }
  drawImageRect(blurImg, 1, 1, 10, 10, -W * 0.1, -H * 0.1, W * 1.2, H * 1.2, 255, 0, 0, 0x8c8c8c);   // the border texels left out: no dark edge
  return true;
}

// ---------------------------------------------------------------- controls
/** A round button holding an icon. */
export function iconButton(id: string, name: string, cx: number, cy: number, size: number, color: u32, tap: () => void, bg: u32 = 0, bgAlpha: i32 = 0): void {
  const r = size / 2 + 10;
  if (bgAlpha > 0) rrect(cx - r, cy - r, r * 2, r * 2, r, bg, bgAlpha);
  if (isPressed(id)) rrect(cx - r, cy - r, r * 2, r * 2, r, 0xffffff, 40);
  glyph(name, cx - size / 2, cy - size / 2, size, color);
  onTap(id, cx - r, cy - r, r * 2, r * 2, tap);
}
/** A capsule button with a text (and an icon). */
export function pill(id: string, x: number, y: number, text: string, fg: u32, bg: u32, tap: () => void, iconName: string = '', h: number = 40): number {
  const f = F.smallB, pad = 18, ic = iconName !== '' ? 22 : 0;
  const w = textWidth(f, text, 0) + pad * 2 + ic;
  rrect(x, y, w, h, h / 2, bg, isPressed(id) ? 170 : 255);
  if (iconName !== '') glyph(iconName, x + pad - 4, y + (h - 18) / 2, 18, fg);
  drawText(f, x + pad + ic, y + (h - fontAscent(f)) / 2 - 1, text, fg, 255, 0);
  onTap(id, x, y, w, h, tap);
  return w;
}
/** iOS segmented control; the width used. */
export function segmented(id: string, x: number, y: number, items: string[], selected: i32, pick: (i: i32) => void, segW: number = 0): number {
  const f = F.smallB, h = 36;
  let w = 0;
  const ws: number[] = [];
  for (const it of items) { const iw = segW > 0 ? segW : textWidth(f, it, 0) + 32; ws.push(iw); w += iw; }
  rrect(x, y, w + 4, h + 4, 10, CARD2, 255);
  let cx = x + 2;
  for (let i = 0; i < items.length; i++) {
    if (i === selected) rrect(cx, y + 2, ws[i], h, 8, 0x636366, 255);
    const sid = `${id}/${i}`;
    if (isPressed(sid) && i !== selected) rrect(cx, y + 2, ws[i], h, 8, 0xffffff, 20);
    centered(f, cx + ws[i] / 2, y + 2 + (h - fontAscent(f)) / 2 - 1, items[i], i === selected ? TEXT : TEXT2);
    const k = i;
    onTap(sid, cx, y + 2, ws[i], h, () => pick(k));
    cx += ws[i];
  }
  return w + 4;
}
/** A horizontal slider 0..1 with a thick touch area and a knob (`knob` false: the knob shows only while it is held, the progress bar);
 *  `change` gets the value while dragging and `done` true on release. */
export function slider(id: string, x: number, y: number, w: number, value: number, color: u32, change: (v: number, done: boolean) => void, thick: number = 6, knob: boolean = true): void {
  const v = Math.max(0, Math.min(1, value));
  const active = isPressed(id), t = active ? thick + 2 : thick;
  rrect(x, y - t / 2, w, t, t / 2, 0xffffff, 50);
  if (v > 0) rrect(x, y - t / 2, Math.max(t, w * v), t, t / 2, color, 255);
  if (knob || active) {
    const r = active ? 15 : 12, kx = x + w * v;
    shadow(kx - r, y - r + 2, r * 2, r * 2, r, 8, 0x000000, 90);
    rrect(kx - r, y - r, r * 2, r * 2, r, 0xffffff, 255);
  }
  onDrag(id, x - 16, y - 26, w + 32, 52, (px: number, py: number, phase: i32) => change(Math.max(0, Math.min(1, (px - x) / w)), phase === 2));
}
/** iOS's activity indicator: twelve bars, the bright one turning (it keeps the frames coming while it shows). */
export function spinner(cx: number, cy: number, r: number, color: u32 = TEXT2): void {
  const phase = Math.floor(performance.now() / 83) % 12;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a), k = (i - phase + 12) % 12;
    const w = Math.max(2, r * 0.18);
    const x0 = cx + c * r * 0.5, y0 = cy + sn * r * 0.5, x1 = cx + c * r, y1 = cy + sn * r;
    stroke([x0, y0, x1, y1], w, color, Math.round(255 - k * 17) as i32, false);
  }
  ui.animating = true;
}
/** A grouped card (iOS inset list). */
export function card(x: number, y: number, w: number, h: number): void { rrect(x, y, w, h, 14, CARD, 255); }
export function separator(x: number, y: number, w: number): void { rect(x, y, w, 1, SEP); }
export function cardShadow(x: number, y: number, w: number, h: number, r: number): void { shadow(x, y + 10, w, h, r, 30, 0x000000, 150); }
