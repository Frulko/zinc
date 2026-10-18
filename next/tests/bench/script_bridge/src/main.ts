// Cost of crossing the zinc:script boundary (typed Zinc <-> QuickJS), by traffic shape, plus two reference kernels so that
// numbers from different machines can be compared as ratios. Prints `BENCH <id> <median_ms> <min_ms> <max_ms> <units> <unit>`
// lines and `BENCH_DONE`; tools/bench-bridge runs it on the Mac, on a device, and writes the JSON artifact.
// Method: one warm-up run, then 5 timed runs, median. Counts are fixed (not scaled) so runs are comparable.
import { Script } from 'zinc:script';
import { exposeNum, callNum } from 'zinc:script/fast';
import * as sys from 'zinc:sys';

const vm = new Script({ memoryLimit: 256 << 20, timeLimitMs: 0 });
const N = 10000;      // cells of a map
const OPS = 5000;     // UI mutations of one frame
const cells: number[] = [];
for (let i = 0; i < N; i++) cells.push((i * 7) % 255);

class Rect { x: number = 1; y: number = 2; w: number = 3; h: number = 4; }
let sink = 0;
vm.expose('add', (a: number, b: number) => a + b);
vm.expose('cell', (i: number) => cells[i]);
vm.expose('op', (code: number, a: number, b: number) => { sink += code + a + b; return 0; });
vm.expose('flush', (b: unknown) => { const buf = b as number[]; let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i]; sink += s; return 0; });
vm.expose('snapshot', () => cells as unknown);
vm.expose('snapshotJson', () => JSON.stringify(cells));
vm.expose('tag', (s: string) => s);
// zinc:script/fast: numbers in, a number out, no text and no Dyn
exposeNum(vm, 'addn', (a: number, b: number, c: number, d: number) => a + b);
exposeNum(vm, 'celln', (i: number, b: number, c: number, d: number) => cells[i]);
exposeNum(vm, 'opn', (code: number, a: number, b: number, d: number) => { sink += code + a + b; return 0; });

vm.eval(`
function inc(x) { return x + 1; }
function len(s) { return s.length; }
function rect(r) { return r.x + r.w; }
function loopHost(n) { let s = 0; for (let i = 0; i < n; i++) s = add(s, i); return s; }
function loopJs(n) { let s = 0; for (let i = 0; i < n; i++) s = (s + i * 3) % 1000003; return s; }
function strsToHost(n) { let t = 0; for (let i = 0; i < n; i++) t += tag('div-class-' + (i & 15)).length; return t; }
function readCellsPerAccess(n) { let s = 0; for (let i = 0; i < n; i++) s += cell(i); return s; }
function readCellsSnapshot() { const c = snapshot(); let s = 0; for (let i = 0; i < c.length; i++) s += c[i]; return s; }
function readCellsJson() { const c = JSON.parse(snapshotJson()); let s = 0; for (let i = 0; i < c.length; i++) s += c[i]; return s; }
function sumSet() { let s = 0; for (let i = 0; i < cellsSet.length; i++) s += cellsSet[i]; return s; }
function loopHostN(n) { let s = 0; for (let i = 0; i < n; i++) s = addn(s, i); return s; }
function readCellsN(n) { let s = 0; for (let i = 0; i < n; i++) s += celln(i); return s; }
function opsPerCallN(n) { for (let i = 0; i < n; i++) opn(1, i, i + 1); }
function opsPerCall(n) { for (let i = 0; i < n; i++) op(1, i, i + 1); }
function opsBatched(n) { const b = new Array(n * 3); for (let i = 0; i < n; i++) { b[i*3] = 1; b[i*3+1] = i; b[i*3+2] = i + 1; } flush(b); }
`, 'bench.js');

class Case { id: string; units: number; unit: string; f: () => void;
  constructor(id: string, units: number, unit: string, f: () => void) { this.id = id; this.units = units; this.unit = unit; this.f = f; } }
const cases: Case[] = [];
function run(id: string, units: number, unit: string, f: () => void): void { cases.push(new Case(id, units, unit, f)); }

// reference kernels: the same arithmetic, typed Zinc and QuickJS
run('ref_zinc_loop', 2000000, 'iter', () => { let s = 0; for (let i = 0; i < 2000000; i++) s = (s + i * 3) % 1000003; sink += s; });
run('ref_js_loop', 200000, 'iter', () => { vm.call('loopJs', [200000]); });

// 1. scalar and small-value calls
run('host_to_script_scalar', 20000, 'call', () => { for (let i = 0; i < 20000; i++) vm.call('inc', [i]); });
run('script_to_host_scalar', 200000, 'call', () => { vm.call('loopHost', [200000]); });
run('host_to_script_string', 20000, 'call', () => { for (let i = 0; i < 20000; i++) vm.call('len', ['a sixty-four character attribute value, as a DOM op would carry it..']); });
run('script_to_host_string', 20000, 'call', () => { vm.call('strsToHost', [20000]); });
run('host_to_script_object', 20000, 'call', () => { const r = new Rect(); for (let i = 0; i < 20000; i++) vm.call('rect', [r]); });

// 1b. the same through zinc:script/fast (numbers only)
const incFn = vm.fn('inc')!;
run('fast_host_to_script', 20000, 'call', () => { for (let i = 0; i < 20000; i++) callNum(incFn, 1, i, 0, 0, 0); });
run('fast_script_to_host', 200000, 'call', () => { vm.call('loopHostN', [200000]); });

// 2. reading a 10,000-cell map from the script
run('map_per_access', N, 'cell', () => { vm.call('readCellsPerAccess', [N]); });
run('fast_map_per_access', N, 'cell', () => { vm.call('readCellsN', [N]); });
run('map_snapshot_dyn', N, 'cell', () => { vm.call('readCellsSnapshot', []); });
run('map_snapshot_json', N, 'cell', () => { vm.call('readCellsJson', []); });
run('map_set_once', N, 'cell', () => { vm.set('cellsSet', cells); });
run('map_read_after_set', N, 'cell', () => { vm.call('sumSet', []); });

// 3. 5,000 UI mutations of one frame (3 numbers each)
run('ops_per_call', OPS, 'op', () => { vm.call('opsPerCall', [OPS]); });
run('fast_ops_per_call', OPS, 'op', () => { vm.call('opsPerCallN', [OPS]); });
run('ops_batched_array', OPS, 'op', () => { vm.call('opsBatched', [OPS]); });


const only = sys.env('ZB_CASE');
if (only.length > 0) {
  const secs = Number(sys.env('ZB_SECS').length > 0 ? sys.env('ZB_SECS') : '10');
  for (const c of cases) if (c.id === only) {
    c.f();
    console.log(`BENCH_PROFILE_START ${only}`);
    const t0 = performance.now(); let n = 0;
    while (performance.now() - t0 < secs * 1000) { c.f(); n++; }
    console.log(`BENCH_PROFILE ${only} ${n} ${c.units} ${(performance.now() - t0).toFixed(1)}`);
  }
} else {
  for (const c of cases) {
    c.f();
    const t: number[] = [];
    for (let r = 0; r < 5; r++) { const a = performance.now(); c.f(); t.push(performance.now() - a); }
    t.sort((x, y) => x - y);
    console.log(`BENCH ${c.id} ${t[2].toFixed(3)} ${t[0].toFixed(3)} ${t[4].toFixed(3)} ${c.units} ${c.unit}`);
  }
}
console.log(`BENCH_META engine=${vm.engine.name} sink=${sink}`);
console.log('BENCH_DONE');
