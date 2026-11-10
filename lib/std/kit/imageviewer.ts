// zinc:ui/kit ImageViewer: a picture opened over the app the way PhotoSwipe does it. It grows from the thumbnail's rectangle to fit the window and
// goes back to it on close (Escape, a click outside the picture, a drag down); the wheel and the trackpad's pinch zoom around the pointer, a
// drag pans a zoomed picture, a double click zooms to 2.5x and back; Left and Right (keys, buttons, a swipe) go through the pictures; the
// caption, a counter and the buttons (zoom, copy, save) are at the top. Built with zinc:ui's nodes on its own modal layer, so it works the same
// under the Solid and the React models and needs nothing mounted. Only transforms move while it animates (no layout per frame).
//
//   openImageViewer({ items, index, origin: (i) => ui.screenBox(thumbNode(i)), onClose: () => {} });
//   an item: { image (a runtime image shown now), width, height (its own, for the ratio), title, detail,
//              sharper? (a better image, decoded off the UI thread: it replaces `image` when it comes), copy? / save? (the buttons) }
import * as ui from 'zinc:ui';
import { icon } from 'zinc:icons';
import { Svg } from 'zinc:svg';
import { destroyImage } from 'zinc:gfx';
import { retainCachedImage, releaseCachedImage } from '../image-cache';
import { attachTooltip } from './tooltip';
import { fitImageRect, imagePanLimit, zoomOffset } from './media-model';
import { springTo, SPRING_SMOOTH } from './motion';
import { theme } from './theme';

export interface ViewerItem {
  image: i32; width: i32; height: i32;
  title?: string; detail?: string;
  /** A fresh sharper copy, owned and released by the viewer, or -1. The thumbnail in `image` remains caller-owned. */
  sharper?: () => Promise<i32>;
  copy?: () => void;
  save?: () => void;
}
export interface ViewerOptions {
  items: ViewerItem[];
  index: i32;
  /** Where the picture is on screen now, [x, y, w, h] of item i (ui.screenBox of its node), null when it is not (scrolled away): the viewer then fades. */
  origin?: (i: i32) => number[] | null;
  onClose?: () => void;
  /** The words of the viewer in the app's language, by name: viewer, zoomOut, zoomIn, copy, save, close, previous, next (English for the ones left out). Each button has them as its label and tooltip. */
  labels?: Map<string, string>;
}

enum ViewerPhase { Opening, Ready, Changing, Closing, Closed }
enum ViewerDrag { Idle, Pan, Dismiss, Swipe }

const MAX_ZOOM = 8, DBL_ZOOM = 2.5, OPEN_MS = 300, CLOSE_MS = 240, FADE_DOWN = 220, SWIPE_X = 90, DISMISS_Y = 110, BAR = 64;
const WHITE = 0xffffff;
let current: Viewer | null = null;
/** True while a viewer is open (the app's own keys wait). */
export function imageViewerOpen(): boolean { return current !== null; }
/** Closes the open viewer. immediate releases it synchronously before its owner destroys borrowed images. */
export function closeImageViewer(immediate: boolean = false): void { const v = current; if (v !== null) v.close(immediate); }
/** The open viewer's state (tests): [index, zoom, panX, panY]. */
export function imageViewerState(): number[] { const v = current; return v === null ? [] : [v.at, v.zoom, v.panX, v.panY]; }

class Viewer {
  o: ViewerOptions;
  at: i32;
  root: i32; back: i32; stage: i32; img: i32; bar: i32; title: i32; detail: i32; count: i32; prev: i32; next: i32; zin: i32; zout: i32; cp: i32; sv: i32;
  zoom = 1; panX = 0; panY = 0;          // the picture's centre is its fitted centre + (panX, panY), scaled by zoom
  fx = 0; fy = 0; fw = 0; fh = 0;        // the fitted rectangle at zoom 1 (stage coordinates)
  W = 0; H = 0;
  startPanX = 0; startPanY = 0; startZoom = 1; dragX = 0; dragY = 0; mode: ViewerDrag = ViewerDrag.Idle;
  phase: ViewerPhase = ViewerPhase.Opening;
  token = 0;
  sharperImage: i32 = -1;
  watch: () => void;
  changeTimer: number = -1; closeTimer: number = -1;

  constructor(o: ViewerOptions) {
    this.o = o; this.at = Math.max(0, Math.min(o.items.length - 1, o.index));
    for (const it of o.items) retainCachedImage(it.image);
    this.root = ui.createNode(ui.VIEW); ui.setClass(this.root, 'absolute inset-0 overflow-hidden'); ui.setRole(this.root, 'dialog'); ui.setLabel(this.root, this.word('viewer', 'Image viewer'));
    this.back = this.el(ui.VIEW, 'absolute inset-0 bg-black', this.root); ui.setNumber(this.back, 'opacity', 0);
    this.stage = this.el(ui.VIEW, 'absolute inset-0', this.root);
    this.img = this.el(ui.IMAGE, 'absolute left-0 top-0', this.stage);
    this.bar = this.el(ui.VIEW, `absolute left-0 top-0 right-0 h-[${BAR}] px-4 flex-row items-center gap-2 bg-[#000000]/45`, this.root); ui.setNumber(this.bar, 'opacity', 0);
    const cap = this.el(ui.VIEW, 'grow shrink min-w-0 flex-col overflow-hidden', this.bar);
    this.title = this.el(ui.TEXT, 'text-base font-semibold text-white', cap);
    this.detail = this.el(ui.TEXT, 'text-xs text-[#c4c9d4]', cap);
    this.count = this.el(ui.TEXT, 'px-2 text-sm text-[#c4c9d4]', this.bar);
    this.zout = this.button('zoom-out', this.word('zoomOut', 'Zoom out'), this.bar, () => { this.zoomBy(1 / 1.5, this.W / 2, this.H / 2); });
    this.zin = this.button('zoom-in', this.word('zoomIn', 'Zoom in'), this.bar, () => { this.zoomBy(1.5, this.W / 2, this.H / 2); });
    this.cp = this.button('copy', this.word('copy', 'Copy'), this.bar, () => { const f = this.o.items[this.at].copy; if (f !== undefined) f(); });
    this.sv = this.button('download', this.word('save', 'Save'), this.bar, () => { const f = this.o.items[this.at].save; if (f !== undefined) f(); });
    this.button('x', this.word('close', 'Close'), this.bar, () => { this.close(); });
    const left = this.el(ui.VIEW, 'absolute left-4 top-0 bottom-0 justify-center', this.root), right = this.el(ui.VIEW, 'absolute right-4 top-0 bottom-0 justify-center', this.root);
    this.prev = this.button('chevron-left', this.word('previous', 'Previous picture'), left, () => { this.go(-1); });
    this.next = this.button('chevron-right', this.word('next', 'Next picture'), right, () => { this.go(1); });
    ui.setNumber(this.prev, 'opacity', 0); ui.setNumber(this.next, 'opacity', 0);
    ui.onPointer(this.stage, ui.PWHEEL, (e: ui.PointerEvent) => { this.wheel(e); });
    ui.onPointer(this.stage, ui.PDBL, (e: ui.PointerEvent) => { this.toggle(e.x, e.y); });
    ui.onPointer(this.stage, ui.PTAP, (e: ui.PointerEvent) => { if (!this.inside(e.x, e.y)) this.close(); });
    ui.onPointer(this.stage, ui.PDRAG, (e: ui.PointerEvent) => { this.drag(e); });
    ui.onPointer(this.stage, ui.PPINCH, (e: ui.PointerEvent) => { this.pinch(e); });
    ui.openLayer(this.root, { priority: 300, modal: true, motion: 'none' });
    ui.focusScope(this.root, { trap: true, restore: true, autoFocus: true });
    ui.onDismiss(this.root, () => { this.close(); });
    ui.onKeyDown(this.root, (e: ui.KeyEvent) => { this.key(e); });
    this.watch = (): void => {
      const box = ui.inspectNode(this.stage);
      if (box !== null && this.phase === ViewerPhase.Ready && (box.lw !== this.W || box.lh !== this.H)) {
        this.fitRect(); this.clamp(); this.sizeImage();
      }
    };
    ui.addWatcher(this.watch);
    ui.onDestroy(this.root, () => { if (this.phase !== ViewerPhase.Closed) { this.transition(ViewerPhase.Closing); this.finish(); } });
  }
  transition(next: ViewerPhase): boolean {
    const allowed = this.phase === ViewerPhase.Opening && (next === ViewerPhase.Ready || next === ViewerPhase.Closing)
      || this.phase === ViewerPhase.Ready && (next === ViewerPhase.Changing || next === ViewerPhase.Closing)
      || this.phase === ViewerPhase.Changing && (next === ViewerPhase.Ready || next === ViewerPhase.Closing)
      || this.phase === ViewerPhase.Closing && next === ViewerPhase.Closed;
    if (!allowed) return false;
    this.phase = next; return true;
  }
  transitionDrag(next: ViewerDrag): void {
    if (next === ViewerDrag.Idle || this.mode === ViewerDrag.Idle) this.mode = next;
  }
  /** A word of the viewer, in the language the app gave. */
  word(key: string, english: string): string { const l = this.o.labels; if (l === undefined) return english; const w = (l as Map<string, string>).get(key); return w === undefined ? english : w as string; }
  el(tag: i32, cls: string, parent: i32): i32 { const n = ui.createNode(tag); ui.setClass(n, cls); ui.insert(parent, n, -1); return n; }
  /** A round icon button: a canvas drawing the icon, the node itself takes the press. */
  button(name: string, label: string, parent: i32, f: () => void): i32 {
    const b = this.el(ui.VIEW, `w-[40] h-[40] rounded-full items-center justify-center hover:bg-[#ffffff]/20 disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-${theme().accent} focus-visible:ring-offset-2`, parent);
    const c = this.el(ui.CANVAS, 'w-[24] h-[24]', b);
    ui.draw(c, (x: i32, y: i32, w: i32, h: i32) => { const s: Svg | null = icon(name, WHITE, 2); if (s !== null) (s as Svg).draw(x, y, w, h, 255); });
    ui.setRole(b, 'button'); ui.setLabel(b, label); ui.listen(b, f);
    ui.onDestroy(b, attachTooltip(b, label, 'bottom'));
    return b;
  }
  stageBox(): number[] { return ui.screenBox(this.stage); }
  /** The fitted rectangle of the picture shown, in stage coordinates. */
  fitRect(): void {
    const sb = this.stageBox(), it = this.o.items[this.at];
    this.W = sb[2]; this.H = sb[3];
    const fitted = fitImageRect(this.W, this.H, it.width, it.height, 16, BAR + 8);
    this.fw = Math.max(1, Math.round(fitted.width)); this.fh = Math.max(1, Math.round(fitted.height));
    this.fx = Math.round((this.W - this.fw) / 2); this.fy = Math.round((this.H - this.fh) / 2);
  }
  /** Shows picture `at` fitted and still (animate: the opening, from the thumbnail). */
  show(grow: boolean): void {
    const it = this.o.items[this.at];
    this.token++;
    this.zoom = 1; this.panX = 0; this.panY = 0;
    ui.setImageHandle(this.img, it.image);
    this.releaseSharper();
    ui.setNumber(this.cp, 'disabled', it.copy === undefined ? 1 : 0); ui.setNumber(this.sv, 'disabled', it.save === undefined ? 1 : 0);
    ui.setText(this.title, it.title ?? ''); ui.setText(this.detail, it.detail ?? ''); ui.setText(this.count, this.o.items.length > 1 ? `${this.at + 1} / ${this.o.items.length}` : '');
    this.sizeImage();
    const t = this.token, s = it.sharper;
    if (s !== undefined) s().then((n: i32) => {
      if (n < 0) return;
      if (t !== this.token || current !== this || (this.phase === ViewerPhase.Closing || this.phase === ViewerPhase.Closed)) { destroyImage(n); return; }
      ui.setImageHandle(this.img, n); this.sharperImage = n;
    });
    if (grow) this.grow();
  }
  sizeImage(): void {
    ui.setNumber(this.img, 'width', this.fw); ui.setNumber(this.img, 'height', this.fh);
    ui.setNumber(this.img, 'left', this.fx); ui.setNumber(this.img, 'top', this.fy);
    this.apply();
  }
  scaleTo(k: number): void { ui.setNumber(this.img, 'scaleX', k); ui.setNumber(this.img, 'scaleY', k); }
  move(key: string, to: number): void { springTo(this.img, key, ui.getNumber(this.img, key), to, SPRING_SMOOTH); }
  scaleAnim(k: number): void {
    springTo(this.img, 'scaleX', ui.getNumber(this.img, 'scaleX'), k, SPRING_SMOOTH);
    springTo(this.img, 'scaleY', ui.getNumber(this.img, 'scaleY'), k, SPRING_SMOOTH);
  }
  apply(): void {
    ui.setNumber(this.img, 'translateX', this.panX); ui.setNumber(this.img, 'translateY', this.panY); this.scaleTo(this.zoom);
  }
  /** The thumbnail's transform: scale and offset that put the fitted picture where the thumbnail is. */
  from(): number[] | null {
    const f = this.o.origin;
    if (f === undefined) return null;
    const r = f(this.at), sb = this.stageBox();
    if (r === null || r[2] < 2 || r[3] < 2 || r[0] + r[2] < sb[0] || r[1] + r[3] < sb[1] || r[0] > sb[0] + sb[2] || r[1] > sb[1] + sb[3]) return null;
    return [(r[0] + r[2] / 2 - sb[0]) - (this.fx + this.fw / 2), (r[1] + r[3] / 2 - sb[1]) - (this.fy + this.fh / 2), r[2] / this.fw];
  }
  grow(): void {
    if (ui.prefersReducedMotion()) {
      ui.setNumber(this.back, 'opacity', 0.92); ui.setNumber(this.bar, 'opacity', 1);
      ui.setNumber(this.prev, 'opacity', this.at > 0 ? 1 : 0); ui.setNumber(this.next, 'opacity', this.at + 1 < this.o.items.length ? 1 : 0);
      this.transition(ViewerPhase.Ready); return;
    }
    const g = this.from();
    if (g === null) { ui.setNumber(this.img, 'opacity', 0); ui.animate(this.img, 'opacity', 1, OPEN_MS, 'ease-out', 0); }
    else {
      ui.setNumber(this.img, 'translateX', g[0]); ui.setNumber(this.img, 'translateY', g[1]); this.scaleTo(g[2]);
      this.move('translateX', 0); this.move('translateY', 0); this.scaleAnim(1);
    }
    ui.animate(this.back, 'opacity', 0.92, OPEN_MS, 'ease-out', 0);
    ui.animate(this.bar, 'opacity', 1, OPEN_MS, 'ease-out', 80);
    this.arrows(1);
    this.transition(ViewerPhase.Ready);
  }
  arrows(to: number): void {
    const n = this.o.items.length;
    springTo(this.prev, 'opacity', ui.getNumber(this.prev, 'opacity'), this.at > 0 ? to : 0, SPRING_SMOOTH);
    springTo(this.next, 'opacity', ui.getNumber(this.next, 'opacity'), this.at < n - 1 ? to : 0, SPRING_SMOOTH);
  }
  /** The picture's point under the stage point (px, py) stays there while the zoom becomes z. */
  zoomTo(z: number, px: number, py: number): void {
    const k = Math.max(1, Math.min(MAX_ZOOM, z)), cx = px - (this.fx + this.fw / 2), cy = py - (this.fy + this.fh / 2);
    this.panX = zoomOffset(this.panX, cx, k / this.zoom); this.panY = zoomOffset(this.panY, cy, k / this.zoom);
    this.zoom = k;
    this.clamp(); this.apply();
  }
  zoomBy(f: number, px: number, py: number): void { this.zoomTo(this.zoom * f, px, py); }
  toggle(x: number, y: number): void {
    if ((this.phase === ViewerPhase.Closing || this.phase === ViewerPhase.Closed)) return;
    const to = this.zoom > 1.01 ? 1 : DBL_ZOOM, cx = x - (this.fx + this.fw / 2), cy = y - (this.fy + this.fh / 2), k = to / this.zoom;
    const px = to === 1 ? 0 : zoomOffset(this.panX, cx, k), py = to === 1 ? 0 : zoomOffset(this.panY, cy, k);
    const b = this.bounds(to);
    this.zoom = to; this.panX = Math.max(-b[0], Math.min(b[0], px)); this.panY = Math.max(-b[1], Math.min(b[1], py));
    this.move('translateX', this.panX); this.move('translateY', this.panY); this.scaleAnim(to);
  }
  /** How far the centre may move at zoom z (a picture smaller than the window stays centred). */
  bounds(z: number): number[] { return [imagePanLimit(this.fw * z, this.W), imagePanLimit(this.fh * z, this.H)]; }
  clamp(): void { const b = this.bounds(this.zoom); this.panX = Math.max(-b[0], Math.min(b[0], this.panX)); this.panY = Math.max(-b[1], Math.min(b[1], this.panY)); }
  inside(x: number, y: number): boolean {
    const cx = this.fx + this.fw / 2 + this.panX, cy = this.fy + this.fh / 2 + this.panY, hw = this.fw * this.zoom / 2, hh = this.fh * this.zoom / 2;
    return x >= cx - hw && x <= cx + hw && y >= cy - hh && y <= cy + hh;
  }
  // while it closes (the picture flies back to its thumbnail) the gestures are over: they would move what the close animates
  wheel(e: ui.PointerEvent): void {
    if ((this.phase === ViewerPhase.Closing || this.phase === ViewerPhase.Closed)) return;
    if (e.pinch !== 1) { this.zoomBy(e.pinch, e.x, e.y); return; }
    if (e.wheel !== 0) this.zoomBy(Math.exp(0.18 * e.wheel), e.x, e.y);
  }
  pinch(e: ui.PointerEvent): void {
    if ((this.phase === ViewerPhase.Closing || this.phase === ViewerPhase.Closed)) return;
    if (e.phase === 0) { this.startZoom = this.zoom; this.startPanX = this.panX; this.startPanY = this.panY; return; }
    if (e.phase === 1) { this.zoomTo(this.startZoom * e.scale, e.x, e.y); }
  }
  drag(e: ui.PointerEvent): void {
    if (this.phase === ViewerPhase.Closing || this.phase === ViewerPhase.Closed) return;
    if (e.phase === 3) {
      this.transitionDrag(ViewerDrag.Idle); this.panX = this.startPanX; this.panY = this.startPanY; this.apply(); return;
    }
    if (e.phase === 0) {
      this.startPanX = this.panX; this.startPanY = this.panY; this.transitionDrag(ViewerDrag.Idle);
    }
    if (e.phase < 2) {
      if (this.mode === ViewerDrag.Idle && Math.abs(e.dx) + Math.abs(e.dy) > 6) this.transitionDrag(this.zoom > 1.01 ? ViewerDrag.Pan : Math.abs(e.dy) > Math.abs(e.dx) ? ViewerDrag.Dismiss : ViewerDrag.Swipe);
      if (this.mode === ViewerDrag.Pan) { this.panX = this.startPanX + e.dx; this.panY = this.startPanY + e.dy; this.clamp(); this.apply(); }
      else if (this.mode === ViewerDrag.Dismiss) {   // down (or up): the picture follows the finger and the dark behind it fades
        this.panY = e.dy; this.apply();
        ui.setNumber(this.back, 'opacity', 0.92 * Math.max(0.2, 1 - Math.abs(e.dy) / (FADE_DOWN * 2)));
      } else if (this.mode === ViewerDrag.Swipe) { this.panX = e.dx * 0.6; this.apply(); }
      return;
    }
    const m = this.mode; this.transitionDrag(ViewerDrag.Idle);
    if (m === ViewerDrag.Dismiss) { if (Math.abs(e.dy) > DISMISS_Y) this.close(); else this.settle(); }
    else if (m === ViewerDrag.Swipe) { if (e.dx < -SWIPE_X && this.at < this.o.items.length - 1) { this.settle(); this.go(1); } else if (e.dx > SWIPE_X && this.at > 0) { this.settle(); this.go(-1); } else this.settle(); }
    else if (m === ViewerDrag.Pan) { /* panned: stays where it is */ }
  }
  settle(): void {
    this.move('translateX', 0); this.move('translateY', 0);
    ui.animate(this.back, 'opacity', 0.92, 200, 'ease-out', 0);
    this.panX = 0; this.panY = 0;
  }
  go(d: i32): void {
    const n = this.at + d;
    if (n < 0 || n >= this.o.items.length || this.phase !== ViewerPhase.Ready) return;
    if (ui.prefersReducedMotion()) { this.at = n; this.fitRect(); this.show(false); this.arrows(1); return; }
    if (!this.transition(ViewerPhase.Changing)) return;
    // the next picture comes from the side it is on; the one shown leaves to the other
    const out = this.img, dir = d > 0 ? 1 : -1;
    ui.animate(out, 'translateX', -dir * (this.W * 0.5), 160, 'ease-in', 0); ui.animate(out, 'opacity', 0, 160, 'ease-in', 0);
    const t = this.token;
    this.changeTimer = setTimeout(() => {
      this.changeTimer = -1;
      if (current !== this || (this.phase === ViewerPhase.Closing || this.phase === ViewerPhase.Closed) || t !== this.token) return;
      this.transition(ViewerPhase.Ready);
      this.at = n; this.fitRect();
      this.show(false);
      ui.setNumber(this.img, 'translateX', dir * (this.W * 0.3)); ui.setNumber(this.img, 'opacity', 0);
      ui.animate(this.img, 'translateX', 0, 220, 'ease-out', 0); ui.animate(this.img, 'opacity', 1, 220, 'ease-out', 0);
      this.arrows(1);
    }, 165);
  }
  key(e: ui.KeyEvent): void {
    if ((this.phase === ViewerPhase.Closing || this.phase === ViewerPhase.Closed)) return;
    const k = e.key;
    if (k === 'ArrowLeft') this.go(-1); else if (k === 'ArrowRight') this.go(1);
    else if (k === '+' || k === '=') this.zoomBy(1.5, this.W / 2, this.H / 2); else if (k === '-') this.zoomBy(1 / 1.5, this.W / 2, this.H / 2);
    else if (k === '0') { this.zoomTo(1, this.W / 2, this.H / 2); }
    else return;
    e.handled = true;
  }
  close(immediate: boolean = false): void {
    if (this.phase === ViewerPhase.Closed) return;
    if (this.phase === ViewerPhase.Closing) { if (immediate) this.finish(); return; }
    this.transition(ViewerPhase.Closing); this.token++;
    if (immediate || ui.prefersReducedMotion()) { this.finish(); return; }
    ui.animate(this.back, 'opacity', 0, CLOSE_MS, 'ease-in-out', 0); ui.animate(this.bar, 'opacity', 0, CLOSE_MS * 0.6, 'ease-in', 0);
    ui.animate(this.prev, 'opacity', 0, 120, 'ease-in', 0); ui.animate(this.next, 'opacity', 0, 120, 'ease-in', 0);
    const g = this.from();
    if (g === null) ui.animate(this.img, 'opacity', 0, CLOSE_MS, 'ease-in', 0);
    else {
      // the picture goes back to the thumbnail from where it is now: zoom and pan are folded into the first leg
      this.move('translateX', g[0]); this.move('translateY', g[1]); this.scaleAnim(g[2]);
    }
    this.closeTimer = setTimeout(() => { this.finish(); }, CLOSE_MS + 30);
  }
  finish(): void {
    if (!this.transition(ViewerPhase.Closed)) return;
    this.token++; ui.removeWatcher(this.watch);
    if (this.changeTimer >= 0) clearTimeout(this.changeTimer);
    if (this.closeTimer >= 0) clearTimeout(this.closeTimer);
    this.changeTimer = -1; this.closeTimer = -1;
    if (current === this) current = null;
    ui.closeLayer(this.root); ui.destroy(this.root);
    this.releaseSharper();
    for (const it of this.o.items) releaseCachedImage(it.image);
    const f = this.o.onClose; if (f !== undefined) f();
  }
  releaseSharper(): void {
    if (this.sharperImage >= 0) { destroyImage(this.sharperImage); this.sharperImage = -1; }
  }
}

/** Opens the viewer on o.items[o.index]; one at a time (a second call is ignored while it is open). */
export function openImageViewer(o: ViewerOptions): void {
  if (current !== null || o.items.length === 0) return;
  const v = new Viewer(o);
  current = v;
  ui.layout();           // the stage has its size: the picture is fitted, then grows from the thumbnail
  v.fitRect(); v.sizeImage(); v.show(true);
}
