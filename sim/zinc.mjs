// Zinc sim shim: runtime helpers shared by generated sim code. Output must match the native runtime byte for byte.

// console.log formatting, Node util.inspect style: must match runtime/zrt_inspect.h byte for byte.
const isTTYOut = !!process.stdout.isTTY && !(process.env.ZINC_LOG_FORMAT ?? '').startsWith('j');
const ESC = { yellow: '\x1b[33m', green: '\x1b[32m', grey: '\x1b[90m', cyan: '\x1b[36m', end: '\x1b[39m' };
function paint(ctx, code, text) { return ctx.color ? code + text + ESC.end : text; }
function visibleWidth(s) { return [...s.replace(/\x1b\[[0-9;]*m/g, '')].length; }
// Node's layout (groupArrayElements + reduceToSingleString, compact 3, breakLength 80): same code as zrt_inspect.h
function joinParts(prefix, open, close, parts, indent, numeric = false, grouping = false) {
  if (!parts.length) return prefix + open + close;
  const entries = parts.length;
  let rows = parts, grouped = false;
  const extra = grouping && parts[parts.length - 1].startsWith('... ');
  const outLen = extra ? parts.length - 1 : parts.length;
  if (grouping && parts.length > 6) {
    const len = parts.slice(0, outLen).map(visibleWidth);
    const total = len.reduce((t, l) => t + l + 2, 0), maxLen = Math.max(...len);
    const actualMax = maxLen + 2;
    if (actualMax * 3 + indent < 80 && (total / actualMax > 5 || maxLen <= 6)) {
      const averageBias = Math.sqrt(actualMax - total / parts.length);
      const biasedMax = Math.max(actualMax - 3 - averageBias, 1);
      const columns = Math.min(Math.round(Math.sqrt(2.5 * biasedMax * outLen) / biasedMax), Math.floor((80 - indent) / actualMax), 12, 15);
      if (columns > 1) {
        const colMax = [];
        for (let c = 0; c < columns; c++) { let w = 0; for (let j = c; j < parts.length; j += columns) if (j < outLen && len[j] > w) w = len[j]; colMax.push(w + 2); }
        rows = [];
        for (let i = 0; i < outLen; i += columns) {
          const max = Math.min(i + columns, outLen);
          let row = '';
          for (let j = i; j < max; j++) {
            const last = j === max - 1;
            if (last && !numeric) { row += parts[j]; break; }
            const target = colMax[j - i] - (last && numeric ? 2 : 0), w = len[j] + (last ? 0 : 2);
            const pad = ' '.repeat(Math.max(0, target - w));
            row += numeric ? pad + parts[j] + (last ? '' : ', ') : parts[j] + ', ' + pad;
          }
          rows.push(row);
        }
        if (extra) rows.push(parts[parts.length - 1]);
        grouped = true;
      }
    }
  }
  if (!grouped || entries === rows.length) {
    const total = rows.reduce((t, r) => t + visibleWidth(r), rows.length);
    if (!grouped && !rows.some(r => r.includes('\n')) && total + rows.length + indent + open.length + Math.max(0, prefix.length - 1) + 10 <= 80)
      return `${prefix}${open} ${rows.join(', ')} ${close}`;
  }
  return `${prefix}${open}\n${rows.map(r => '  ' + r.replace(/\n/g, '\n  ')).join(',\n')}\n${close}`;
}
function quoteString(v) {
  return "'" + v.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/\r/g, '\\r') + "'";
}
function inspectKey(k) { return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : `'${k}'`; }
function inspect(v, ctx) {
  if (typeof v === 'number') return paint(ctx, ESC.yellow, String(v));
  if (typeof v === 'boolean') return paint(ctx, ESC.yellow, String(v));
  if (typeof v === 'string') return paint(ctx, ESC.green, quoteString(v));
  if (v === null) return ctx.color ? '\x1b[1mnull\x1b[22m' : 'null';
  if (v === undefined) return paint(ctx, ESC.grey, 'undefined');
  if (typeof v === 'function') return paint(ctx, ESC.cyan, '[Function (anonymous)]');
  if (v instanceof Promise) return 'Promise {}';
  if (v instanceof Error) return v.name + (v.message ? ': ' + v.message : '');
  if (Array.isArray(v)) {
    if (ctx.depth > 2) return paint(ctx, ESC.cyan, '[Array]');
    ctx.depth++;
    const parts = v.slice(0, 100).map(x => inspect(x, ctx));
    ctx.depth--;
    if (v.length > 100) parts.push(`... ${v.length - 100} more item${v.length - 100 === 1 ? '' : 's'}`);
    return joinParts('', '[', ']', parts, ctx.depth * 2, v.slice(0, 100).every(x => typeof x === 'number'), true);
  }
  if (v instanceof Map || v instanceof Set) {
    const kind = v instanceof Map ? 'Map' : 'Set';
    if (ctx.depth > 2) return paint(ctx, ESC.cyan, `[${kind}]`);
    ctx.depth++;
    const parts = [];
    for (const e of v) { if (parts.length >= 100) break; parts.push(kind === 'Map' ? `${inspect(e[0], ctx)} => ${inspect(e[1], ctx)}` : inspect(e, ctx)); }
    ctx.depth--;
    return joinParts(`${kind}(${v.size}) `, '{', '}', parts, ctx.depth * 2);
  }
  if (typeof v.next === 'function' && typeof v[Symbol.iterator] === 'function') return paint(ctx, ESC.cyan, 'Object [Generator] {}');
  if (ctx.stack.includes(v)) return paint(ctx, ESC.cyan, '[Circular]');
  const name = v.constructor && v.constructor !== Object ? v.constructor.name : null;
  if (ctx.depth > 2) return paint(ctx, ESC.cyan, `[${name ?? 'Object'}]`);
  ctx.stack.push(v); ctx.depth++;
  const parts = [];
  for (const k of Object.keys(v)) {
    if (typeof v[k] === 'function' || parts.length >= 100) continue;
    parts.push(`${inspectKey(k)}: ${inspect(v[k], ctx)}`);
  }
  ctx.depth--; ctx.stack.pop();
  return joinParts(name ? name + ' ' : '', '{', '}', parts, ctx.depth * 2);
}
/** Top-level console arguments: strings as they are, everything else inspected. */
function fmtTop(v) {
  if (typeof v === 'string') return v;
  return inspect(v, { color: isTTYOut, depth: 0, stack: [] });
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
  if (isTTY && err && !text.includes('\x1b')) { process.stderr.write((level === 'warn' ? '\x1b[33m' : '\x1b[31m') + text + '\x1b[0m\n'); return; }
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
  // Dyn (runtime/zrt_dyn.h): values are plain JS values; conversions are checked with the same messages
  dto(v, d) {
    const kind = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
    const bad = to => $z.panic(`Uncaught TypeError: cannot convert Dyn (${kind}) to ${to}`);
    switch (d === 'd' || d === 'n' || d === 's' || d === 'b' ? d : d[0]) {
      case 'd': return v;
      case 'n': return typeof v === 'number' ? v : bad('number');
      case 's': return typeof v === 'string' ? v : bad('string');
      case 'b': return typeof v === 'boolean' ? v : bad('boolean');
      case 'a':  // a checked copy, like the native typed array
        if (v == null) return null;
        if (!Array.isArray(v)) bad('array');
        return d[1] === 'd' ? v : v.map(x => $z.dto(x, d[1]));
      case 'c':
        if (v == null) return null;
        if (typeof v === 'object') for (let p = Object.getPrototypeOf(v); p; p = Object.getPrototypeOf(p)) if (p.constructor?.name === d[1]) return v;
        return bad(d[1]);
      case 'o': {
        if (v == null) return null;
        if (typeof v !== 'object' || Array.isArray(v)) bad(d[1]);
        const r = {};
        for (const [k, fd, opt] of d[2]) {
          const x = Object.hasOwn(v, k) ? v[k] : undefined;
          if (opt && x === undefined) continue;
          r[k] = $z.dto(x, fd);
        }
        return r;
      }
    }
  },
  jsonParse(s) { try { return JSON.parse(s); } catch { throw new Error('JSON.parse: invalid JSON'); } },
  diter(v) { return Array.isArray(v) ? v : $z.panic(`Uncaught TypeError: cannot convert Dyn (${v === null ? 'null' : typeof v}) to array`); },
  dseti(o, k, v) {
    if (Array.isArray(o) && typeof k === 'number' && (!Number.isInteger(k) || k < 0 || k > o.length)) $z.panic('Uncaught RangeError: arrays with holes are not supported');
    o[k] = v;
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
