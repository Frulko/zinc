// The script side of the playground: one zinc:script context per run, a small drawing API exposed to it, the
// console lines and the error of the last run. The canvas calls drawFrame() every frame; it calls the script's
// draw(t), whose drawing calls land on the canvas through the exposed functions.
import { Script, ScriptError } from 'zinc:script';
import * as gfx from 'zinc:gfx';
import { createSignal } from 'zinc:ui/solid';

export class LogLine {
  constructor(public text: string, public error: boolean) {}
}
export const [logs, setLogs] = createSignal<LogLine[]>([]);
/** 1-based line of main.js where the last run failed, 0 when it is fine. */
export const [errorLine, setErrorLine] = createSignal<i32>(0);
export const [stats, setStats] = createSignal<string>('');

// Script-side helpers: default arguments and console.log, so the host functions keep fixed, typed signatures.
const PRELUDE = `
function color(r, g, b, a = 255) { __color(r, g, b, a); }
function line(x1, y1, x2, y2, w = 1) { __line(x1, y1, x2, y2, w); }
function ring(x, y, r, w = 1) { __ring(x, y, r, w); }
function text(x, y, s, size = 14) { __text(x, y, String(s), size); }
const console = { log: (...a) => __log(a.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' ')) };
`;

let vm: Script | null = null;
let failed = false;
let hasDraw = false;
let started = 0;
let lastDraw = 0;
let evalMs = 0;
// the canvas rectangle while draw(t) runs, and the current colour
let ox = 0, oy = 0, cw = 0, ch = 0;
let col: u32 = 0xffffff;
let alpha: i32 = 255;

function push(text: string, error: boolean): void {
  const next = logs().slice(Math.max(0, logs().length - 199));
  next.push(new LogLine(text, error));
  setLogs(next);
}
function fail(e: Error): void {
  failed = true;
  if (e instanceof ScriptError) {
    const where = e.line > 0 ? ` (${e.file}:${e.line})` : '';
    push(`${e.message}${where}`, true);
    setErrorLine(e.file === 'main.js' ? e.line : 0);
  } else push(e.message, true);
}
function circlePoints(x: number, y: number, r: number): number[] {
  const pts: number[] = [];
  const n: i32 = Math.max(12, Math.min(96, Math.floor(r * 1.5)));
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; pts.push(x + Math.cos(a) * r); pts.push(y + Math.sin(a) * r); }
  return pts;
}
let small: i32 = -1, large: i32 = -1;
function loadFonts(): void { if (small < 0) { small = gfx.font('sans', 14); large = gfx.font('sans-bold', 24); } }

/** Starts a new context with `src` as main.js (the previous one is disposed). */
export function run(src: string): void {
  if (vm !== null) (vm as Script).dispose();
  setErrorLine(0);
  failed = false;
  const s = new Script({ memoryLimit: 16 << 20, timeLimitMs: 50 });
  vm = s;
  s.expose('__log', (msg: string) => { push(msg, false); });
  s.expose('__color', (r: i32, g: i32, b: i32, a: i32) => {
    const c = (v: i32): u32 => Math.max(0, Math.min(255, v));
    col = (c(r) << 16) | (c(g) << 8) | c(b);
    alpha = Math.max(0, Math.min(255, a));
  });
  s.expose('clear', (r: i32, g: i32, b: i32) => { gfx.rect(ox, oy, cw, ch, (r << 16) | (g << 8) | b); });
  s.expose('rect', (x: number, y: number, w: number, h: number) => { gfx.rrect(ox + x, oy + y, w, h, 0, col, alpha); });
  s.expose('circle', (x: number, y: number, r: number) => { gfx.rrect(ox + x - r, oy + y - r, r * 2, r * 2, r, col, alpha); });
  s.expose('__ring', (x: number, y: number, r: number, w: number) => { gfx.stroke(circlePoints(ox + x, oy + y, r), w, col, alpha, true); });
  s.expose('__line', (x1: number, y1: number, x2: number, y2: number, w: number) => { gfx.stroke([ox + x1, oy + y1, ox + x2, oy + y2], w, col, alpha, false); });
  s.expose('__text', (x: number, y: number, t: string, size: number) => {
    loadFonts();
    gfx.drawText(size >= 20 ? large : small, ox + x, oy + y, t, col, alpha, 0);
  });
  s.expose('time', () => (performance.now() - started) / 1000);
  s.expose('width', () => cw);
  s.expose('height', () => ch);
  started = performance.now();
  const t = performance.now();
  try {
    s.eval(PRELUDE, 'prelude.js');
    s.eval(src, 'main.js');
    const d = s.fn('draw');
    hasDraw = d !== null;
    if (d !== null) d.release();
    push(`ran main.js (${src.split('\n').length} lines)`, false);
  } catch (e) { fail(e); }
  evalMs = performance.now() - t;
}

/** The canvas: background, then the script's draw(t) clipped to the canvas. */
export function drawFrame(x: i32, y: i32, w: i32, h: i32): void {
  ox = x; oy = y; cw = w; ch = h;
  gfx.rect(x, y, w, h, 0x0b0d14);
  if (failed) {
    loadFonts();
    const msg = 'Stopped on an error: fix it, then Run';
    gfx.drawText(small, x + (w - gfx.textWidth(small, msg, 0)) / 2, y + h / 2, msg, 0x71717a, 255, 0);
  }
  if (vm === null || failed || !hasDraw) return;
  const s = vm as Script;
  gfx.clip(x, y, w, h);
  col = 0xffffff; alpha = 255;
  const t = performance.now();
  try { s.call('draw', [(t - started) / 1000]); } catch (e) { fail(e); }
  lastDraw = performance.now() - t;
  gfx.unclip();
  setStats(`QuickJS · ${Math.round(s.memoryUsed() / 1024)} KiB · eval ${evalMs.toFixed(2)} ms · draw ${lastDraw.toFixed(2)} ms`);
}
