// zinc:ffi on the sim target. Node cannot load C libraries, so the sim knows a small set of libc / libm functions by
// name (enough for tests and examples) and emulates the memory helpers over a private heap; anything else fails to
// resolve with the same error text as dlsym.
type Fn = (ints: number[], strs: Map<number, string>, floats: number[]) => number | string | null;
const heap = new Map<number, Uint8Array>();  // base address -> block
let next = 0x10000;
let err = '';
let text = '';
const at = (p: number): [Uint8Array, number] | null => {
  for (const [b, m] of heap) if (p >= b && p < b + m.length) return [m, p - b];
  return null;
};
const cstr = (ints: number[], strs: Map<number, string>, i: number): string => {
  if (strs.has(i)) return strs.get(i)!;
  const m = at(ints[i]);
  if (!m) return '';
  let e = m[1]; while (e < m[0].length && m[0][e] !== 0) e++;
  return Buffer.from(m[0].subarray(m[1], e)).toString();
};
const i32 = (v: number): number => v | 0;
const SYMS: Record<string, Fn> = {
  strlen: (a, s) => Buffer.byteLength(cstr(a, s, 0)),
  strcmp: (a, s) => { const x = Buffer.from(cstr(a, s, 0)), y = Buffer.from(cstr(a, s, 1)); return Math.sign(Buffer.compare(x, y)); },
  atoi: (a, s) => i32(parseInt(cstr(a, s, 0), 10) || 0),
  atol: (a, s) => parseInt(cstr(a, s, 0), 10) || 0,
  abs: a => Math.abs(i32(a[0])),
  labs: a => Math.abs(a[0]),
  toupper: a => (a[0] >= 97 && a[0] <= 122 ? a[0] - 32 : a[0]),
  tolower: a => (a[0] >= 65 && a[0] <= 90 ? a[0] + 32 : a[0]),
  getpid: () => process.pid,
  getenv: (a, s) => process.env[cstr(a, s, 0)] ?? null,
  memset: a => { const m = at(a[0]); if (m) m[0].fill(a[1] & 255, m[1], m[1] + a[2]); return a[0]; },
  sqrt: (_a, _s, f) => Math.sqrt(f[0]), pow: (_a, _s, f) => Math.pow(f[0], f[1]), floor: (_a, _s, f) => Math.floor(f[0]),
  ceil: (_a, _s, f) => Math.ceil(f[0]), fabs: (_a, _s, f) => Math.abs(f[0]), sin: (_a, _s, f) => Math.sin(f[0]),
  cos: (_a, _s, f) => Math.cos(f[0]), hypot: (_a, _s, f) => Math.hypot(f[0], f[1]), fmax: (_a, _s, f) => Math.max(f[0], f[1]),
  ldexp: (a, _s, f) => f[0] * 2 ** i32(a[0]),
};
const fns: Fn[] = [];
let libs = 0;

export default {
  open(path: string): number {
    if (path === '' || /(^|\/)lib(c|m|System)[.\-]/.test(path) || path === 'libc.so.6' || path === 'libm.so.6') return libs++;
    err = `dlopen(${path}): the sim only knows libc / libm (zinc:ffi, docs/plugins/ffi.md)`;
    return -1;
  },
  close(_h: number): void {},
  sym(_h: number, name: string): number {
    const f = SYMS[name];
    if (!f) { err = `symbol not found: ${name}`; return 0; }
    fns.push(f);
    return 0x7f000000 + fns.length;  // a fake address that indexes the table
  },
  error(): string { return err; },
  call(fn: number, ints: number[], strs: string[], strAt: number[], floats: number[], ret: number): number {
    const f = fns[fn - 0x7f000001];
    const sm = new Map<number, string>();
    strs.forEach((s, k) => sm.set(strAt[k], s));
    const r = f ? f(ints, sm, floats) : 0;
    if (ret === 6) { text = typeof r === 'string' ? r : ''; return r === null ? 0 : 1; }
    if (typeof r !== 'number') return 0;
    if (ret === 1) return r | 0;
    if (ret === 2) return r >>> 0;
    if (ret === 7) return Math.fround(r);
    return r;
  },
  text(): string { return text; },
  alloc(n: number): number { const b = next; next += Math.max(16, (n + 15) & ~15); heap.set(b, new Uint8Array(Math.max(1, n))); return b; },
  free(p: number): void { heap.delete(p); },
  read(p: number, n: number): number[] { const m = at(p); return m ? Array.from(m[0].subarray(m[1], m[1] + n)) : []; },
  write(p: number, data: number[]): void { const m = at(p); if (m) m[0].set(data.slice(0, m[0].length - m[1]), m[1]); },
  readCString(p: number): string { return cstr([p], new Map(), 0); },
};
