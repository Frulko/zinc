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

let rng = 0x2545f491;
const state = { frameCb: null, quit: false, frame: 0 };

export const $z = globalThis.$z = {
  state,
  log: (...a) => { process.stdout.write(a.map(fmtTop).join(' ') + '\n'); },
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

/** Headless frame loop with a virtual clock (TST-10), same budget as the native null HAL. */
export async function runMain(load) {
  await load();
  if (!state.frameCb) return;
  const frames = Number(process.env.ZINC_FRAMES ?? 60);
  for (let i = 0; i < frames && !state.quit; i++) {
    state.frameCb(1 / 60);
    state.frame++;
  }
  process.exit(0);
}
