// Zinc sim shim: runtime helpers shared by generated sim code. Output must match the native runtime byte for byte.

function fmtTop(v) {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v === null || v === undefined) return String(v);
  return json(v);
}
function json(v) {
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null';
  if (typeof v === 'boolean') return String(v);
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return '[' + v.map(json).join(',') + ']';
  if (v instanceof Map || v instanceof Set) return '{}';
  const parts = [];
  for (const k of Object.keys(v)) {
    if (typeof v[k] === 'function') continue;
    parts.push(JSON.stringify(k) + ':' + json(v[k]));
  }
  return '{' + parts.join(',') + '}';
}

import { SIN, IDX_K } from './fx_sin.mjs';

let rng = 0x2545f491;
const isTTY = !!process.stdout.isTTY;
const jsonLog = (process.env.ZINC_LOG_FORMAT ?? '').startsWith('j');
const LEVELS = { log: 'LOG', info: 'INFO', debug: 'DEBUG', warn: 'WARN', error: 'ERROR', trace: 'TRACE' };
function emit(level, text) {
  const err = level === 'warn' || level === 'error' || level === 'trace';
  if (jsonLog) { process.stdout.write(JSON.stringify({ time: performance.now(), level: LEVELS[level], message: text }) + '\n'); return; }
  if (isTTY && err) { process.stderr.write((level === 'warn' ? '\x1b[33m' : '\x1b[31m') + text + '\x1b[0m\n'); return; }
  (err ? process.stderr : process.stdout).write(text + '\n');
}
const labels = new Map(), counts = new Map();
// fixed point helpers (RT-04): values are exact doubles raw / 2^F
const fxw = (raw, F) => (raw | 0) / 2 ** F;
const raw = (x, F) => Math.round(x * 2 ** F);
const fxm = {
  abs: (F, a) => fxw(Math.abs(raw(a, F)), F),
  floor: (F, a) => fxw(raw(a, F) & ~(2 ** F - 1), F),
  ceil: (F, a) => -fxm.floor(F, -a),
  round: (F, a) => fxm.floor(F, fxw(raw(a, F) + 2 ** (F - 1), F)),
  trunc: (F, a) => a >= 0 ? fxm.floor(F, a) : fxm.ceil(F, a),
  sign: (F, a) => Math.sign(a),
  min: (F, a, b) => a < b ? a : b,
  max: (F, a, b) => a > b ? a : b,
  sqrt: (F, a) => { const r = raw(a, F); if (r <= 0) return 0; let n = BigInt(r) << BigInt(F), x = 0n, bit = 1n << 62n; while (bit > n) bit >>= 2n; while (bit) { if (n >= x + bit) { n -= x + bit; x = (x >> 1n) + bit; } else x >>= 1n; bit >>= 2n; } return fxw(Number(x), F); },
  sin: (F, a) => { const i = Number((BigInt(raw(a, F)) * IDX_K) >> BigInt(F + 16)) & 4095; const s = SIN[i]; return fxw(F >= 16 ? s << (F - 16) : s >> (16 - F), F); },
  cos: (F, a) => { const i = (Number((BigInt(raw(a, F)) * IDX_K) >> BigInt(F + 16)) + 1024) & 4095; const s = SIN[i]; return fxw(F >= 16 ? s << (F - 16) : s >> (16 - F), F); },
  pow: (F, a, b) => $z.fx(Math.pow(a, b), F),
  tan: (F, a) => $z.fx(Math.tan(a), F),
  atan2: (F, a, b) => $z.fx(Math.atan2(a, b), F),
  exp: (F, a) => $z.fx(Math.exp(a), F),
  log: (F, a) => $z.fx(Math.log(a), F),
  hypot: (F, a, b) => fxm.sqrt(F, $z.fx($z.fxmul(a, a, F) + $z.fxmul(b, b, F), F)),
  fround: (F, a) => a,
};
const state = { frameCb: null, quit: false, frame: 0 };

export const $z = globalThis.$z = {
  state,
  log: (...a) => emit('log', a.map(fmtTop).join(' ')),
  c_log: (...a) => emit('log', a.map(fmtTop).join(' ')),
  c_info: (...a) => emit('info', a.map(fmtTop).join(' ')),
  c_debug: (...a) => emit('debug', a.map(fmtTop).join(' ')),
  c_warn: (...a) => emit('warn', a.map(fmtTop).join(' ')),
  c_error: (...a) => emit('error', a.map(fmtTop).join(' ')),
  c_trace: (...a) => emit('trace', a.map(fmtTop).join(' ')),
  c_time: (l = 'default') => labels.set(l, performance.now()),
  c_timeEnd: (l = 'default') => { const t = labels.get(l); labels.delete(l); emit(t === undefined ? 'warn' : 'log', `${l}: ${t === undefined ? 'no such label' : Math.trunc((performance.now() - t) * 1000) / 1000 + 'ms'}`); },
  c_timeLog: (l = 'default') => { const t = labels.get(l); emit(t === undefined ? 'warn' : 'log', `${l}: ${t === undefined ? 'no such label' : Math.trunc((performance.now() - t) * 1000) / 1000 + 'ms'}`); },
  c_count: (l = 'default') => { const n = (counts.get(l) ?? 0) + 1; counts.set(l, n); emit('log', `${l}: ${n}`); },
  c_assert: (ok, ...a) => { if (!ok) emit('error', 'Assertion failed' + (a.length ? ': ' + a.map(fmtTop).join(' ') : '')); },
  c_table: rows => emit('log', '(index)\tvalues\n' + rows.map((r, i) => `${i}\t${fmtTop(r)}`).join('\n')),
  fx: (x, F) => fxw(Math.floor(x * 2 ** F + 0.5), F),
  fxmul: (a, b, F) => fxw(Number((BigInt(raw(a, F)) * BigInt(raw(b, F))) >> BigInt(F)), F),
  fxdiv: (a, b, F) => { if (b === 0) $z.panic('fixed-point division by zero'); return fxw(Number((BigInt(raw(a, F)) << BigInt(F)) / BigInt(raw(b, F))), F); },
  fxmod: (a, b, F) => { if (b === 0) $z.panic('fixed-point division by zero'); return fxw(raw(a, F) % raw(b, F), F); },
  fxm,
  panic(msg, file, line) {
    process.stdout.write('');
    process.stderr.write(file ? `panic: ${msg} (${file}:${line})\n` : `panic: ${msg}\n`);
    process.exit(101);
  },
  idiv(a, b) { if (b === 0) $z.panic('integer division by zero'); return a / b; },
  imod(a, b) { if (b === 0) $z.panic('integer division by zero'); return a % b; },
  get(a, i) {
    if (i !== (i | 0)) $z.panic('non-integer array index');
    if (i < 0 || i >= a.length) $z.panic('array index out of bounds');
    return a[i];
  },
  set(a, i, v) {
    if (i !== (i | 0)) $z.panic('non-integer array index');
    if (i < 0 || i > a.length) $z.panic('array index out of bounds');
    a[i] = v;
    return v;
  },
  // xorshift32, identical to runtime/zrt.cpp
  random() {
    rng ^= rng << 13; rng >>>= 0;
    rng ^= rng >>> 17;
    rng ^= rng << 5; rng >>>= 0;
    return rng / 4294967296;
  },
  seed(s) { rng = (s >>> 0) || 0x2545f491; },
};

// decorators and globals the compiler understands natively
globalThis.weak = () => {};
globalThis.value = () => {};
globalThis.pooled = () => () => {};
globalThis.Arena = class Arena { static frame() { return new Arena(); } promote(x) { return x; } [Symbol.dispose]() {} };
const uncaught = e => $z.panic('Uncaught ' + (e instanceof Error ? String(e) : 'Error'));
process.on('uncaughtException', uncaught);
process.on('unhandledRejection', uncaught);

/** Headless frame loop with a virtual clock (TST-10), same budget as the native null HAL. */
export async function runMain(load) {
  try { await load(); } catch (e) { uncaught(e); }
  if (!state.frameCb) return;
  const frames = Number(process.env.ZINC_FRAMES ?? 60);
  for (let i = 0; i < frames && !state.quit; i++) {
    try { state.frameCb(1 / 60); } catch (e) { uncaught(e); }
    state.frame++;
    await null;  // let microtasks run between frames, like the native loop
  }
  process.exit(0);
}
