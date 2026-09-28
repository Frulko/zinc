// zinc:wasm on the sim target: V8's WebAssembly behind the handle API of wasm.host.cpp (errors spelled like wasm3's).
const mods: (WebAssembly.Module | null)[] = [];
interface Inst { m: WebAssembly.Module; imports: Record<string, Record<string, (...a: unknown[]) => unknown>>; i: WebAssembly.Instance | null }
const insts: (Inst | null)[] = [];
let err = '';
let failed = false;
let cb: ((id: number, args: number[]) => number) | null = null;

const TRAPS: [RegExp, string][] = [
  [/^unreachable/, 'unreachable'], [/divide by zero/, 'integer divide by zero'], [/divide result unrepresentable|integer overflow/, 'integer overflow'],
  [/memory access out of bounds/, 'out of bounds memory access'], [/Maximum call stack size exceeded/, 'stack overflow'],
  [/float unrepresentable/, 'invalid conversion to integer'], [/signature mismatch/, 'indirect call type mismatch'], [/table index is out of bounds/, 'undefined element'],
];
const trap = (e: any): string => { const m = String(e?.message ?? e); for (const [re, s] of TRAPS) if (re.test(m)) return s; return m; };
const alloc = <T>(list: (T | null)[], v: T): number => { let h = list.indexOf(null); if (h < 0) { h = list.length; list.push(null); } list[h] = v; return h; };
const num = (v: unknown): number => (typeof v === 'bigint' ? Number(v) : typeof v === 'number' ? v : 0);

export default {
  compile(bytes: number[]): number {
    try { return alloc(mods, new WebAssembly.Module(Uint8Array.from(bytes))); } catch (e: any) { err = e.message; return -1; }
  },
  instantiate(m: number): number { const mod = mods[m]; if (!mod) { err = 'module is gone'; return -1; } return alloc(insts, { m: mod, imports: {}, i: null }); },
  linkImport(h: number, module: string, name: string, id: number): boolean {
    const x = insts[h];
    if (!x || !WebAssembly.Module.imports(x.m).some(d => d.module === module && d.name === name && d.kind === 'function')) return false;
    (x.imports[module] ??= {})[name] = (...a: unknown[]) => { const r = cb!(id, a.map(num)); return r; };
    return true;
  },
  start(h: number): boolean {
    const x = insts[h]; if (!x) { err = 'instance is gone'; return false; }
    for (const d of WebAssembly.Module.imports(x.m)) if (d.kind === 'function' && !x.imports[d.module]?.[d.name]) { err = `import ${d.module}.${d.name} is not provided`; return false; }
    try { x.i = new WebAssembly.Instance(x.m, x.imports as WebAssembly.Imports); return true; } catch (e) { err = trap(e); return false; }
  },
  call(h: number, name: string, args: number[]): number {
    failed = false;
    const f = insts[h]?.i?.exports[name];
    if (typeof f !== 'function') { err = `no exported function ${name}`; failed = true; return NaN; }
    const run = (a: unknown[]): number => num((f as (...x: unknown[]) => unknown)(...a));
    try { return run(args); } catch (e: any) {
      // i64 parameters take BigInts in JS (the native side converts from doubles)
      if (e instanceof TypeError && /BigInt/.test(e.message)) { try { return run(args.map(v => (Number.isInteger(v) ? BigInt(v) : v))); } catch (e2) { err = trap(e2); failed = true; return NaN; } }
      err = trap(e); failed = true; return NaN;
    }
  },
  failed(): boolean { return failed; },
  argCount(h: number, name: string): number { const f = insts[h]?.i?.exports[name]; return typeof f === 'function' ? f.length : -1; },
  memorySize(h: number): number { const m = Object.values(insts[h]?.i?.exports ?? {}).find(v => v instanceof WebAssembly.Memory) as WebAssembly.Memory | undefined; return m ? m.buffer.byteLength : 0; },
  memoryRead(h: number, off: number, n: number): number[] {
    const m = Object.values(insts[h]?.i?.exports ?? {}).find(v => v instanceof WebAssembly.Memory) as WebAssembly.Memory | undefined;
    if (!m || off < 0 || n < 0 || off + n > m.buffer.byteLength) { err = 'out of bounds memory access'; return []; }
    return Array.from(new Uint8Array(m.buffer, off, n));
  },
  memoryWrite(h: number, off: number, data: number[]): boolean {
    const m = Object.values(insts[h]?.i?.exports ?? {}).find(v => v instanceof WebAssembly.Memory) as WebAssembly.Memory | undefined;
    if (!m || off < 0 || off + data.length > m.buffer.byteLength) { err = 'out of bounds memory access'; return false; }
    new Uint8Array(m.buffer).set(data, off);
    return true;
  },
  globalGet(h: number, name: string): number { const g = insts[h]?.i?.exports[name]; return g instanceof WebAssembly.Global ? num(g.value) : NaN; },
  free(h: number): void { insts[h] = null; },
  error(): string { return err; },
  onImport(f: (id: number, args: number[]) => number): void { cb = f; },
};
