// zinc:lottie — Lottie (Bodymovin JSON) animations rendered natively on the shared rasterizer (docs/plugins/lottie.md).
// load() parses once into a compact scene (native/lottie.host.cpp); draw() evaluates a frame and emits gfx paths.
// Player adds playback state; <Lottie/> is a zinc:ui canvas node driven by the engine clock.
import * as gfx from 'zinc:gfx';
import * as assets from 'zinc:assets';
import * as ui from 'zinc:ui';
import { clock } from 'zinc:sys';
import L from './native/lottie.spec';

/** Loads an animation from the assets (embedded at build time) or, failing that, from a file path. -1 on error. */
export function load(name: string): i32 { return assets.exists(name) ? L.parse(assets.readText(name)) : L.open(name); }
/** Parses a Lottie JSON document. -1 on error. */
export function parse(json: string): i32 { return L.parse(json); }
export function width(a: i32): number { return L.width(a); }
export function height(a: i32): number { return L.height(a); }
export function frames(a: i32): number { return L.frames(a); }
export function fps(a: i32): number { return L.fps(a); }
/** Seconds. */
export function duration(a: i32): number { const f = L.fps(a); return f > 0 ? L.frames(a) / f : 0; }
export function layers(a: i32): i32 { return L.layers(a); }
/** Draws `frame` (0 = first) fitted into the box: aspect ratio kept, centered, clipped to the composition. */
export function draw(a: i32, frame: number, x: number, y: number, w: number, h: number): void { L.draw(a, frame, x, y, w, h, 255); }
export function free(a: i32): void { L.free(a); }

let spent: number = 0;
/** Milliseconds spent in Player.draw since the last call (evaluation, flattening and command replay; the rasterizer
 *  runs later, when the frame is presented). */
export function drawMs(): number { const s = spent; spent = 0; return s; }

export class Player {
  readonly anim: i32;
  /** Current frame, 0-based (fractional while playing). */
  frame: number = 0;
  speed: number = 1;
  loop: boolean = true;
  playing: boolean = false;
  /** false (default): frames are shown whole, at the file's frame rate — cheaper, and each frame is drawn from
   *  cache while it lasts. true: interpolated frames at the display rate. */
  subframe: boolean = false;
  alpha: i32 = 255;
  from: number = 0;
  to: number;
  private atlas: i32 = -1;
  private cw: i32 = 0;
  private ch: i32 = 0;
  private bg: u32 = 0;
  private cached: boolean[] = [];

  constructor(anim: i32) { this.anim = anim; this.to = L.frames(anim); }
  play(): void { this.playing = true; }
  pause(): void { this.playing = false; }
  stop(): void { this.playing = false; this.frame = this.from; }
  seek(frame: number): void { this.frame = Math.max(this.from, Math.min(frame, this.to)); }
  /** Plays frames [from, to) only. */
  segment(from: number, to: number): void { this.from = from; this.to = to; this.frame = from; }
  /** Advances the playhead by dt seconds. */
  update(dt: number): void {
    if (!this.playing) return;
    const len = this.to - this.from;
    if (len <= 0) return;
    this.frame += dt * L.fps(this.anim) * this.speed;
    if (this.frame >= this.to) {
      if (this.loop) this.frame = this.from + (this.frame - this.from) % len;
      else { this.frame = this.to - 0.001; this.playing = false; }
    } else if (this.frame < this.from) {
      if (this.loop) this.frame = this.to - (this.from - this.frame) % len;
      else { this.frame = this.from; this.playing = false; }
    }
  }
  /** Frame that draw() shows. */
  shown(): number { return this.subframe ? this.frame : Math.floor(this.frame); }

  /** Render-to-image mode for small looping icons: frames are rasterized once into a runtime image of
   *  w x (h * frames) on the background colour `bg` (runtime images are opaque), then drawn as a 1:1 copy.
   *  Returns false (and stays vector) when the atlas would exceed maxBytes. */
  cache(w: i32, h: i32, bg: u32, maxBytes: i32): boolean {
    const n: i32 = Math.ceil(this.to - this.from);
    if (w <= 0 || h <= 0 || n <= 0 || w * h * n * 4 > maxBytes) return false;
    if (this.atlas >= 0) gfx.destroyImage(this.atlas);
    this.atlas = gfx.createImage(w, h * n);
    if (this.atlas < 0) return false;
    this.cw = w; this.ch = h; this.bg = bg;
    this.cached = [];
    for (let i = 0; i < n; i++) this.cached.push(false);
    return true;
  }

  draw(x: number, y: number, w: number, h: number): void {
    const t0 = clock();
    this.render(x, y, w, h);
    spent += clock() - t0;
  }
  private render(x: number, y: number, w: number, h: number): void {
    if (this.atlas < 0) { L.draw(this.anim, this.shown(), x, y, w, h, this.alpha); return; }
    const k: i32 = Math.max(0, Math.min(this.cached.length - 1, Math.floor(this.frame - this.from)));
    if (!this.cached[k]) {
      gfx.beginImage(this.atlas);
      gfx.rect(0, k * this.ch, this.cw, this.ch, this.bg);
      L.draw(this.anim, this.from + k, 0, k * this.ch, this.cw, this.ch, 255);
      gfx.endImage();
      this.cached[k] = true;
    }
    gfx.clip(x, y, w, h);
    gfx.drawImage(this.atlas, x, y - k * h, w, h * this.cached.length, this.alpha, 0);
    gfx.unclip();
  }
  close(): void {
    if (this.atlas >= 0) gfx.destroyImage(this.atlas);
    this.atlas = -1;
  }
}

export interface LottieProps {
  src: string;
  loop?: boolean;
  autoplay?: boolean;
  speed?: number;
  class?: string;
  /** Interpolated frames (see Player.subframe). */
  subframe?: boolean;
  /** Render-to-image mode (Player.cache) on this background colour, for small looping icons. */
  cacheBg?: number;
  /** Receives the Player (play/pause/seek from the app). */
  player?: (p: Player) => void;
}
/** <Lottie src="spinner.json" loop autoplay class="w-24 h-24"/>: a canvas node that plays an animation on the UI
 *  engine clock. Paused or finished, it redraws the same commands and the frame diff rasterizes nothing. */
export function Lottie(props: LottieProps): i32 {
  const node = ui.createNode(ui.CANVAS);
  const cls = props.class ?? '';
  if (cls !== '') ui.setClass(node, cls);
  const p = new Player(load(props.src));
  p.loop = props.loop ?? false;
  p.speed = props.speed ?? 1;
  p.subframe = props.subframe ?? false;
  if (props.autoplay ?? false) p.play();
  const cb = props.player;
  if (cb !== undefined) cb(p);
  const bg = props.cacheBg ?? -1;
  let last = ui.now();
  let sized = false;
  ui.draw(node, (x: i32, y: i32, w: i32, h: i32) => {
    const now = ui.now();
    p.update((now - last) / 1000);
    last = now;
    if (!sized && bg >= 0) { sized = true; p.cache(w, h, bg, 8 << 20); }
    p.draw(x, y, w, h);
  });
  return node;
}
