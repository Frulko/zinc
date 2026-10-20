// throw, try/catch/finally, rethrow, jumps out of try blocks, errors through calls, lambdas and virtual methods.
class AppError extends Error {
  constructor(public code: i32, msg: string) { super(msg); }
}
class Shape { area(): i32 { return 1; } }
class Bad extends Shape { area(): i32 { throw new AppError(7, 'bad shape'); } }
class Res { constructor(public name: string) {} }

function risky(n: i32): i32 {
  if (n < 0) throw new RangeError('negative: ' + n);
  if (n === 0) throw new AppError(404, 'zero');
  return n * 2;
}
function viaStack(n: i32): string {
  const tmp = new Res('tmp' + n);
  const label = 'v' + n;
  return label + ':' + risky(n) + tmp.name;
}
let log = '';
function trace(s: string): void { log += s + ' '; }

function a(): i32 {
  try { trace('a-try'); return risky(1); } catch (e) { trace('never'); return -1; } finally { trace('a-fin'); }
}
function b(): i32 {
  try { return risky(0); } catch (e) { trace('b-catch'); return -2; } finally { trace('b-fin'); }
}
function c(): string {
  let state = 'start';
  try {
    state = 'in-try';
    risky(-1);
    state = 'unreachable';
  } catch (e) {
    state += '|' + e.name + '|' + e.message;
  }
  return state;
}
function d(): string {
  let out = '';
  for (let i = 0; i < 5; i++) {
    try {
      if (i === 1) continue;
      if (i === 3) break;
      out += 'b' + i;
    } finally {
      out += 'f' + i + ' ';
    }
  }
  return out;
}
function e2(): string {
  try {
    try { risky(0); } finally { trace('inner-fin'); }
  } catch (e) {
    if (e instanceof AppError) return 'app ' + e.code;
    return 'other';
  }
  return 'none';
}
function f(): string {
  try {
    try { risky(-5); } catch (e) { trace('rethrow'); throw new AppError(1, 'wrapped ' + e.message); }
  } catch (e) {
    return e.message;
  }
  return 'none';
}
function g(): i32 {
  try { return 1; } finally { trace('g-fin'); }
}
function h(): i32 {
  let total = 0;
  for (let i = -1; i < 3; i++) {
    try { total += risky(i); } catch (e) { total += 100; }
  }
  return total;
}

console.log(a(), b(), c(), d());
console.log(e2(), f(), g(), h());
try { console.log(viaStack(2)); console.log(viaStack(0)); } catch (e) { console.log('caught', e.message); }
const shapes: Shape[] = [new Shape(), new Bad()];
let sum = 0;
for (const s of shapes) { try { sum += s.area(); } catch (e) { sum += 10; } }
console.log(sum);
try {
  const r = [1, 2, 3].map(x => { if (x === 2) throw new Error('in map ' + x); return x; });
  console.log(r);
} catch (e) {
  console.log(`${e}`);
}
const lazy = (n: i32): i32 => risky(n);
try { lazy(-9); } catch (e) { console.log(e.name, e.message); }
console.log(log);
console.log(new AppError(3, 'x').code, `${new TypeError('t')}`, `${new Error('')}`);
