import { env } from 'zinc:sys';
import { bakeStats, bakeCount } from '../view/scenery';
import { camera } from '../view/camera';
import { world } from '../world/world';

// ZINC_HAMLET_PERF=<frames per report> (e.g. 300): prints frame-time percentiles, hitches (frames over twice the median) and the split of each frame
// (update, village picture, upload, interface) to the console. Off by default and free then (perf.on is checked first).
export const perf = { on: false };
const SLOTS = ['update', 'village', 'upload', 'ui'];
let every = 300, last = 0, count = 0, started = 0;
let frames: number[] = [], all: number[] = [];
const slots: number[][] = [[], [], [], []];
const cur: number[] = [0, 0, 0, 0];
let mark = 0;
const SLOW_MS = 40;       // a frame over this is named on the console with its split

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
  if (last > 0 && now - last > SLOW_MS) console.log('perf-slow frame ' + count + ' z' + camera.level + ' ' + r(now - last) + ' ms | ' + SLOTS.map((n: string, k: number): string => n + ' ' + r(cur[k])).join(' | '));
  for (let k = 0; k < 4; k++) cur[k] = 0;
  last = now; count++;
  if (started === 0) started = now;
  if (frames.length >= every) {
    const s = frames.slice().sort((a: number, b: number): number => a - b), med = pct(s, .5);
    let hitches = 0, worst = 0; for (const f of frames) { if (f > 2 * med) hitches++; if (f > worst) worst = f; }
    const parts: string[] = [];
    for (let k = 0; k < 4; k++) { const t = slots[k].slice().sort((a: number, b: number): number => a - b); parts.push(SLOTS[k] + ' p50 ' + r(pct(t, .5)) + ' p99 ' + r(pct(t, .99))); }
    console.log('perf@' + count + ' z' + camera.level + ' frame p50 ' + r(med) + ' p95 ' + r(pct(s, .95)) + ' p99 ' + r(pct(s, .99)) + ' max ' + r(worst) + ' hitches ' + hitches + ' | ' + parts.join(' | ') + ' | people ' + world.people.length + ', animals ' + world.deer.length + ' | bakes ' + bakeCount + ' full ' + bakeStats.full + ' warm ' + bakeStats.warm + ' last ' + r(bakeStats.lastMs) + ' ms');
    for (const f of frames) all.push(f);
    const a = all.slice().sort((x: number, y: number): number => x - y), am = pct(a, .5);
    let ah = 0; for (const f of all) if (f > 2 * am) ah++;
    console.log('perf-total n ' + a.length + ' p50 ' + r(am) + ' p95 ' + r(pct(a, .95)) + ' p99 ' + r(pct(a, .99)) + ' max ' + r(a[a.length - 1]) + ' hitches ' + ah + ' over17 ' + a.filter((f: number): boolean => f > 16.7).length + ' over34 ' + a.filter((f: number): boolean => f > 33.4).length + ' over50 ' + a.filter((f: number): boolean => f > 50).length);
    frames = []; for (let k = 0; k < 4; k++) slots[k] = [];
  }
}
