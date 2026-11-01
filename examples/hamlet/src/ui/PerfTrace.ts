import { env } from 'zinc:sys';
import { bakeStats, bakeCount } from '../view/scenery';
import { camera } from '../view/camera';

// ZINC_HAMLET_PERF=<frames per report> (e.g. 300): prints frame-time percentiles, hitches (frames over twice the median) and the split of each frame
// (update, village picture, upload, interface) to the console. Off by default and free then (perf.on is checked first).
export const perf = { on: false };
const SLOTS = ['update', 'village', 'upload', 'ui'];
let every = 300, last = 0, count = 0, started = 0;
let frames: number[] = [];
const slots: number[][] = [[], [], [], []];
const cur: number[] = [0, 0, 0, 0];
let mark = 0;

export function perfStart(): void { const n = Number(env('ZINC_HAMLET_PERF')); if (n > 0) { perf.on = true; every = n; } }
/** Starts a slot's clock; perfEnd adds the time since. */
export function perfBegin(): void { if (perf.on) mark = performance.now(); }
export function perfEnd(slot: number): void { if (perf.on) { const now = performance.now(); cur[slot] += now - mark; mark = now; } }
const pct = (s: number[], q: number): number => s.length === 0 ? 0 : s[Math.min(s.length - 1, Math.floor(s.length * q))];
const r = (v: number): number => Math.round(v * 100) / 100;
/** Called once per drawn frame, after everything. */
export function perfFrame(): void {
  if (!perf.on) return;
  const now = performance.now();
  if (last > 0) { frames.push(now - last); for (let k = 0; k < 4; k++) { slots[k].push(cur[k]); } }
  for (let k = 0; k < 4; k++) cur[k] = 0;
  last = now; count++;
  if (started === 0) started = now;
  if (frames.length >= every) {
    const s = frames.slice().sort((a: number, b: number): number => a - b), med = pct(s, .5);
    let hitches = 0, worst = 0; for (const f of frames) { if (f > 2 * med) hitches++; if (f > worst) worst = f; }
    const parts: string[] = [];
    for (let k = 0; k < 4; k++) { const t = slots[k].slice().sort((a: number, b: number): number => a - b); parts.push(SLOTS[k] + ' p50 ' + r(pct(t, .5)) + ' p99 ' + r(pct(t, .99))); }
    console.log('perf@' + count + ' z' + camera.level + ' frame p50 ' + r(med) + ' p95 ' + r(pct(s, .95)) + ' p99 ' + r(pct(s, .99)) + ' max ' + r(worst) + ' hitches ' + hitches + ' | ' + parts.join(' | ') + ' | bakes ' + bakeCount + ' full ' + bakeStats.full + ' last ' + r(bakeStats.lastMs) + ' ms');
    frames = []; for (let k = 0; k < 4; k++) slots[k] = [];
  }
}
