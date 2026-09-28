// zinc:script costs (docs/plugins/script.md, "Measurements"): context creation, eval of a 1 KB script, host ->
// script and script -> host call overhead, conversion of a data record, and how a runaway allocation meets the
// memory limit. `zinc run examples/scripting/bench` (release build); the sim column comes from `--target sim`.
import { Script } from 'zinc:script';

// ~1 KB of typical game-logic script: a few functions, an object, a loop
const SCRIPT_1K = `
const rules = { speed: 150, perLevel: 25, bonus: [0, 10, 20, 40, 80] };
function ballSpeed(level) { return rules.speed + (level - 1) * rules.perLevel; }
function points(row, rows, level) {
  const base = (rows - row) * 10;
  return base + (rules.bonus[Math.min(level, rules.bonus.length - 1)] | 0);
}
function combo(hits) {
  let total = 0;
  for (let i = 0; i < hits; i++) total += i < 3 ? 1 : i < 6 ? 2 : 4;
  return total;
}
function describe(level) {
  return 'level ' + level + ': speed ' + ballSpeed(level) + ', top row ' + points(0, 3 + level, level);
}
class Emitter {
  constructor() { this.handlers = {}; }
  on(name, f) { (this.handlers[name] ||= []).push(f); return this; }
  emit(name, value) { for (const f of this.handlers[name] || []) f(value); }
}
const events = new Emitter();
let score = 0;
events.on('brick', p => { score += p; }).on('reset', () => { score = 0; });
for (let level = 1; level <= 5; level++) events.emit('brick', points(level % 3, 4, level));
const summary = [1, 2, 3].map(describe).join('; ');
({ score, summary: summary.length, combo: combo(8) });
`;

function median(xs: number[]): number {
  const s = xs.slice().sort((a: number, b: number) => a - b);
  return s[Math.floor(s.length / 2)];
}
function fmt(x: number): string { return x < 10 ? x.toFixed(2) : x.toFixed(1); }

console.log(`script size: ${SCRIPT_1K.length} bytes`);

// context creation
const creates: number[] = [];
let base = 0;
for (let i = 0; i < 20; i++) {
  const t = performance.now();
  const vm = new Script({ memoryLimit: 0, timeLimitMs: 0 });
  creates.push(performance.now() - t);
  base = vm.memoryUsed();
  vm.dispose();
}
console.log(`new Script(): ${fmt(median(creates) * 1000)} us, ${Math.round(base / 1024)} KiB allocated by the engine`);

// eval of the 1 KB script: in a fresh context each time, and again in the same context (a re-run / hot reload)
const fresh: number[] = [], again: number[] = [];
const warm = new Script({ memoryLimit: 0, timeLimitMs: 0 });
for (let i = 0; i < 50; i++) {
  const vm = new Script({ memoryLimit: 0, timeLimitMs: 0 });
  let t = performance.now();
  vm.eval(SCRIPT_1K);
  fresh.push(performance.now() - t);
  vm.dispose();
  t = performance.now();
  warm.eval(`{${SCRIPT_1K}}`);   // a block: the let / const / class declarations do not clash
  again.push(performance.now() - t);
}
console.log(`eval 1 KB (parse + run): ${fmt(median(fresh) * 1000)} us in a new context, ${fmt(median(again) * 1000)} us re-run`);

// host -> script: vm.call and a ScriptFunction handle, with one number argument and a number result
const N = 100000;
const vm = new Script({ memoryLimit: 0, timeLimitMs: 0 });
vm.eval('function inc(x) { return x + 1; } function noop() {}');
let t = performance.now();
let acc: unknown = 0;
for (let i = 0; i < N; i++) acc = vm.call('inc', [i]);
const callUs = (performance.now() - t) * 1000 / N;
const inc = vm.fn('inc')!;
t = performance.now();
for (let i = 0; i < N; i++) acc = inc.call([i]);
const refUs = (performance.now() - t) * 1000 / N;
t = performance.now();
for (let i = 0; i < N; i++) vm.call('noop', []);
const noopUs = (performance.now() - t) * 1000 / N;
console.log(`host -> script: call('inc', [i]) ${fmt(callUs)} us, handle ${fmt(refUs)} us, call('noop', []) ${fmt(noopUs)} us per call (${acc})`);

// script -> host: a typed host function called in a script loop, minus the same loop calling a script function
let hostCalls: i32 = 0;
vm.expose('hostInc', (x: number) => { hostCalls++; return x + 1; });
vm.eval('function localInc(x) { return x + 1; }');
t = performance.now();
vm.eval(`{ let a = 0; for (let i = 0; i < ${N}; i++) a = hostInc(a); a }`);
const hostLoop = performance.now() - t;
t = performance.now();
vm.eval(`{ let a = 0; for (let i = 0; i < ${N}; i++) a = localInc(a); a }`);
const localLoop = performance.now() - t;
console.log(`script -> host: ${fmt(hostLoop * 1000 / N)} us per hostInc(x) call, ${fmt((hostLoop - localLoop) * 1000 / N)} us above a script-to-script call (${hostCalls} calls)`);

// data: a record of 100 entries in and out
const rows: unknown[] = [];
for (let i = 0; i < 100; i++) rows.push({ id: i, name: `row ${i}`, tags: ['a', 'b'], score: i * 1.5 });
t = performance.now();
for (let i = 0; i < 100; i++) vm.set('rows', rows);
const setUs = (performance.now() - t) * 1000 / 100;
t = performance.now();
for (let i = 0; i < 100; i++) acc = vm.get('rows');
const getUs = (performance.now() - t) * 1000 / 100;
console.log(`set / get of 100 records: ${fmt(setUs)} us / ${fmt(getUs)} us`);

// a runaway allocation against an 8 MiB limit (QuickJS counts every byte; the sim only sees V8's own limits)
const small = new Script({ memoryLimit: 8 << 20, timeLimitMs: 2000 });
t = performance.now();
try {
  small.eval('{ const keep = []; for (let i = 0; ; i++) keep.push({ i, s: "item " + i }); }');
  console.log('memory limit: not reached');
} catch (e) {
  console.log(`memory limit: ${e.message} after ${fmt(performance.now() - t)} ms, ${Math.round(small.memoryUsed() / 1024)} KiB in use afterwards; ${small.eval('"still usable"')}`);
}
