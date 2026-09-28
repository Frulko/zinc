// zinc:script engine 'quickjs' on the sim target: node:vm contexts with the behaviour of quickjs.host.cpp (same
// value conversions, error descriptions, stack normalisation, module name resolution), so conformance programs print
// the same thing on both sides. Differences (docs/plugins/script.md): no byte budget (only V8's own allocation
// failures count as 'memory' errors), interrupt() takes effect when the running entry returns, memoryUsed() is 0.
// Not a security boundary: node:vm isolates globals, not the process.
import vm from 'node:vm';

type AnyFn = (...a: any[]) => any;
interface Intrinsics { Array: any; Object: any; Error: any; ReferenceError: any; TypeError: any; Promise: any; JSON: any }
interface Vm {
  h: number; gen: number; ctx: vm.Context; g: any; C: Intrinsics;
  limitMs: number; memLimit: number; depth: number; interrupted: boolean; closing: boolean;
  result: unknown; err: unknown;
  refs: (AnyFn | undefined)[]; calls: Map<number, [AnyFn, AnyFn]>;
  mods: Map<string, string>; loaded: Map<string, any>; ns: any[];
  resolver: ((name: string) => string) | null; nextId: number;
  pending: Set<number>;  // followed promises not settled yet
  wrap: (h: AnyFn) => AnyFn; invoker: vm.Script; drain: vm.Script;
}

const vms: (Vm | null)[] = [];
let gens = 0;
let onEvent: ((h: number, kind: number, id: number, v: unknown) => void) | null = null;
const CALL = Symbol.for('zinc:script.call');
const MAX_DEPTH = 64;

/** A script function held by the host (quickjs.host.cpp JsFnBox). */
class JsFnBox {
  constructor(public h: number, public gen: number, public fn: AnyFn) {}
  toString(): string { return 'function'; }
  toJSON(): null { return null; }
}

const vmOf = (h: number): Vm | null => { const v = vms[h]; return v && !v.closing ? v : null; };
function refAdd(v: Vm, f: AnyFn): number {
  let i = v.refs.indexOf(undefined);
  if (i < 0) { i = v.refs.length; v.refs.push(undefined); }
  v.refs[i] = f;
  return i;
}

// ---------------------------------------------------------------- values
function toDyn(v: Vm, x: any, depth: number): unknown {
  switch (typeof x) {
    case 'number': case 'string': case 'boolean': case 'undefined': return x;
    case 'symbol': return undefined;
    case 'bigint': return Number(BigInt.asIntN(64, x));
    case 'function': return new JsFnBox(v.h, v.gen, x);
  }
  if (x === null) return null;
  if (depth > MAX_DEPTH) throw new v.C.TypeError('value nested too deeply');
  if (Array.isArray(x)) {
    const a: unknown[] = [];
    for (let i = 0; i < x.length; i++) a.push(toDyn(v, x[i], depth + 1));
    return a;
  }
  const o: Record<string, unknown> = {};
  for (const k of Object.keys(x)) Object.defineProperty(o, k, { value: toDyn(v, x[k], depth + 1), enumerable: true, writable: true, configurable: true });
  return o;
}
function toJs(v: Vm, d: any, depth: number): any {
  if (d === null || typeof d !== 'object') return d;
  if (depth > MAX_DEPTH) throw new v.C.TypeError('value nested too deeply');
  if (d instanceof JsFnBox) return d.h === v.h && d.gen === v.gen ? d.fn : undefined;
  if (Array.isArray(d)) { const a = new v.C.Array(); for (const x of d) a.push(toJs(v, x, depth + 1)); return a; }
  const proto = Object.getPrototypeOf(d);
  if (proto !== Object.prototype && proto !== null) return v.C.JSON.parse(JSON.stringify(d));  // objects of Zinc classes
  const o = new v.C.Object();
  for (const k of Object.keys(d)) Object.defineProperty(o, k, { value: toJs(v, d[k], depth + 1), enumerable: true, writable: true, configurable: true });
  return o;
}

// ---------------------------------------------------------------- errors
const info = (kind: string, type: string, message: string, file = '', line = 0, stack = '') => ({ kind, type, message, file, line, stack });
/** Script frames of a V8 stack, as quickjs.host.cpp frames() writes them. */
function frames(stack: string): { stack: string; file: string; line: number } {
  const out: string[] = [];
  let file = '', line = 0;
  for (const raw of stack.split('\n')) {
    const s = raw.replace(/^ +/, '');
    if (!s.startsWith('at ') || s.length < 4) continue;
    let fn = '', loc = s.slice(3);
    if (loc.endsWith(')')) {
      const open = loc.lastIndexOf(' (');
      if (open < 0) continue;
      fn = loc.slice(0, open); loc = loc.slice(open + 2, -1);
    }
    const m = /^(.*):(\d+):(\d+)$/.exec(loc);
    if (!m || +m[2] <= 0 || m[1] === '' || m[1].startsWith('node:') || m[1].startsWith('file:')) continue;
    const anon = fn === '' || fn === '<eval>' || fn === '<anonymous>';
    out.push(anon ? `at ${loc}` : `at ${fn} (${loc})`);
    if (!line) { file = m[1]; line = +m[2]; }
  }
  return { stack: out.join('\n'), file, line };
}
function takeError(v: Vm, e: any): void {
  if (v.interrupted) { v.interrupted = false; v.err = info('interrupted', '', 'script interrupted'); return; }
  if (e && e.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') { v.err = info('timeout', '', `script ran longer than ${v.limitMs} ms`); return; }
  if (e !== null && typeof e === 'object' && typeof e.stack === 'string') {
    const type = String(e.name), message = String(e.message);
    if (type === 'RangeError' && (message === 'Invalid string length' || message === 'Array buffer allocation failed')) {
      v.err = info('memory', 'RangeError', `out of memory (limit ${v.memLimit} bytes)`);
      return;
    }
    const f = frames(e.stack);
    if (!f.line && type === 'SyntaxError') {  // V8 puts `file:line` on the first line of a syntax error
      const m = /^(.*):(\d+)\n/.exec(e.stack);
      if (m) { f.file = m[1]; f.line = +m[2]; f.stack = `at ${m[1]}:${m[2]}`; }
    }
    v.err = info(type === 'SyntaxError' ? 'syntax' : 'error', type, message, f.file, f.line, f.stack);
    return;
  }
  let s: string;
  try { s = String(e); } catch { s = ''; }
  v.err = info('error', '', 'Uncaught ' + s);
}

// ---------------------------------------------------------------- entries
const timeout = (v: Vm) => (v.limitMs > 0 ? { timeout: Math.max(1, Math.round(v.limitMs)) } : {});
/** Runs `work` as a host -> script entry (microtasks drained by node:vm afterwards); false: error in v.err. */
function entry(v: Vm, work: () => unknown): boolean {
  v.depth++;
  try {
    const r = work();
    if (v.depth === 1 && v.interrupted) throw new Error('interrupted');
    v.result = r;
    return true;
  } catch (e) {
    takeError(v, e);
    // a limit stopped the entry's jobs: the promises they were settling never will (quickjs.host.cpp reject_pending)
    if (v.depth === 1 && ((v.err as any).kind === 'timeout' || (v.err as any).kind === 'interrupted')) {
      const ids = [...v.pending];
      v.pending.clear();
      for (const id of ids) onEvent?.(v.h, 2, id, v.err);
    }
    return false;
  } finally {
    if (--v.depth === 0 && v.closing) free(v);
  }
}
/** Calls a script function under the time limit. */
function invoke(v: Vm, f: any, name: string, args: unknown[]): any {
  if (typeof f !== 'function') throw new v.C.TypeError(`${name} is not a function`);
  const a = new v.C.Array();
  for (const x of args) a.push(toJs(v, x, 0));
  Object.defineProperty(v.g, CALL, { value: { f, a }, configurable: true });
  try { return v.invoker.runInContext(v.ctx, timeout(v)); } finally { delete v.g[CALL]; }
}
function lookup(v: Vm, name: string): any {
  let f = v.g[name];
  for (let i = v.ns.length - 1; i >= 0 && f === undefined; i--) f = v.ns[i][name];
  return f;
}
/** evalAsync / callAsync: 0 = value in result, id = pending, -1 = error. */
function follow(v: Vm, ok: boolean): number {
  if (!ok) return -1;
  const p = v.result;
  if (!(p instanceof v.C.Promise)) { v.result = toDyn(v, p, 0); return 0; }
  const id = ++v.nextId;
  v.pending.add(id);
  (p as any).then(
    (x: unknown) => { if (!v.pending.delete(id)) return; let d: unknown, kind = 1; try { d = toDyn(v, x, 0); } catch (e) { takeError(v, e); d = v.err; kind = 2; } onEvent?.(v.h, kind, id, d); },
    (e: unknown) => { if (!v.pending.delete(id)) return; takeError(v, e); onEvent?.(v.h, 2, id, v.err); });
  return id;
}
function normalize(base: string, name: string): string {
  if (!name.startsWith('.')) return name;
  const slash = base.lastIndexOf('/');
  let dir = slash >= 0 ? base.slice(0, slash) : '', r = name;
  for (;;) {
    if (r.startsWith('./')) r = r.slice(2);
    else if (r.startsWith('../')) {
      if (dir === '') break;
      const p = dir.lastIndexOf('/'), last = dir.slice(p + 1);
      if (last === '.' || last === '..') break;
      dir = p >= 0 ? dir.slice(0, p) : '';
      r = r.slice(3);
    } else break;
  }
  return dir ? `${dir}/${r}` : r;
}
/** V8 reports no position for a module's syntax error: the line is the shortest prefix of the source that fails
 *  with the same message. */
function syntaxLine(v: Vm, src: string, message: string): number {
  const lines = src.split('\n');
  for (let k = 1; k <= lines.length; k++) {
    try { new (vm as any).SourceTextModule(lines.slice(0, k).join('\n'), { context: v.ctx }); } catch (e: any) { if (e.message === message) return k; }
  }
  return 0;
}
function moduleOf(v: Vm, name: string, src: string): any {
  let m: any;
  try { m = new (vm as any).SourceTextModule(src, { context: v.ctx, identifier: name }); } catch (e: any) {
    if (e?.name === 'SyntaxError') e.stack = `${name}:${syntaxLine(v, src, e.message)}\n${e.stack}`;
    throw e;
  }
  v.loaded.set(name, m);
  m.linkRequests(m.moduleRequests.map((r: { specifier: string }) => {
    const n = normalize(name, r.specifier);
    const hit = v.loaded.get(n);
    if (hit) return hit;
    const s = v.mods.get(n) ?? (v.resolver ? v.resolver(n) : '');
    if (!s) throw new v.C.ReferenceError(`could not load module '${n}'`);
    return moduleOf(v, n, s);
  }));
  return m;
}
function free(v: Vm): void { vms[v.h] = null; v.refs = []; v.calls.clear(); }

export default {
  create(memoryLimit: number, timeLimitMs: number, _stackSize: number): number {
    let h = vms.indexOf(null);
    if (h < 0) { h = vms.length; vms.push(null); }
    const ctx = vm.createContext({}, { microtaskMode: 'afterEvaluate', codeGeneration: { strings: true, wasm: false } });
    const boot = vm.runInContext(`(now, atob, btoa) => {
      globalThis.queueMicrotask = f => { Promise.resolve().then(f); };
      globalThis.performance = { now };
      globalThis.atob = s => atob(String(s)); globalThis.btoa = s => btoa(String(s));
      return { C: { Array, Object, Error, ReferenceError, TypeError, Promise, JSON }, wrap: h => function (...a) { return h(a); } };
    }`, ctx, { filename: 'node:zinc' })(() => performance.now(), atob, btoa);
    const v: Vm = {
      h, gen: ++gens, ctx, g: vm.runInContext('globalThis', ctx), C: boot.C, limitMs: timeLimitMs, memLimit: memoryLimit, depth: 0,
      interrupted: false, closing: false, result: undefined, err: undefined, refs: [], calls: new Map(), mods: new Map(),
      loaded: new Map(), ns: [], resolver: null, nextId: 0, pending: new Set(), wrap: boot.wrap,
      invoker: new vm.Script('(s => s.f.apply(undefined, s.a))(globalThis[Symbol.for("zinc:script.call")])', { filename: 'node:zinc-call' }),
      drain: new vm.Script('', { filename: 'node:zinc-drain' }),
    };
    vms[h] = v;
    return h;
  },
  destroy(h: number): void { const v = vmOf(h); if (!v) return; if (v.depth > 0) v.closing = true; else free(v); },
  eval(h: number, src: string, file: string): boolean {
    const v = vmOf(h);
    return !!v && entry(v, () => toDyn(v, vm.runInContext(src, v.ctx, { filename: file, ...timeout(v) }), 0));
  },
  evalAsync(h: number, src: string, file: string): number {
    const v = vmOf(h);
    return v ? follow(v, entry(v, () => vm.runInContext(src, v.ctx, { filename: file, ...timeout(v) }))) : -1;
  },
  define(h: number, name: string, src: string): void { vmOf(h)?.mods.set(name, src); },
  resolver(h: number, fn: (name: string) => string): void { const v = vmOf(h); if (v) v.resolver = fn; },
  load(h: number, name: string, src: string): boolean {
    const v = vmOf(h);
    return !!v && entry(v, () => {
      const m = moduleOf(v, name, src);
      m.instantiate();
      m.evaluate(timeout(v)).catch(() => {});
      if (m.status === 'errored') throw m.error;
      v.ns.push(m.namespace);
      return undefined;
    });
  },
  call(h: number, fn: string, args: unknown[]): boolean {
    const v = vmOf(h);
    return !!v && entry(v, () => toDyn(v, invoke(v, lookup(v, fn), fn, args), 0));
  },
  callAsync(h: number, fn: string, args: unknown[]): number {
    const v = vmOf(h);
    return v ? follow(v, entry(v, () => invoke(v, lookup(v, fn), fn, args))) : -1;
  },
  callRef(h: number, ref: number, args: unknown[]): boolean {
    const v = vmOf(h);
    if (!v) return false;
    const f = v.refs[ref];
    if (!f) { v.err = info('error', 'TypeError', 'released function handle'); return false; }
    return entry(v, () => toDyn(v, invoke(v, f, 'function', args), 0));
  },
  refNamed(h: number, name: string): number {
    const v = vmOf(h);
    if (!v) return -1;
    const f = lookup(v, name);
    return typeof f === 'function' ? refAdd(v, f) : -1;
  },
  refValue(h: number, x: unknown): number {
    const v = vmOf(h);
    return v && x instanceof JsFnBox && x.h === h && x.gen === v.gen ? refAdd(v, x.fn) : -1;
  },
  unref(h: number, ref: number): void { const v = vmOf(h); if (v && ref >= 0 && ref < v.refs.length) v.refs[ref] = undefined; },
  set(h: number, name: string, x: unknown): boolean {
    const v = vmOf(h);
    return !!v && entry(v, () => { v.g[name] = toJs(v, x, 0); return undefined; });
  },
  get(h: number, name: string): boolean {
    const v = vmOf(h);
    return !!v && entry(v, () => toDyn(v, v.g[name], 0));
  },
  result(h: number): unknown { return vmOf(h)?.result; },
  error(h: number): unknown { return vmOf(h)?.err ?? info('host', 'Error', 'zinc:script: the script was disposed'); },
  expose(h: number, name: string, fn: (args: unknown[]) => unknown): void {
    const v = vmOf(h);
    if (!v) return;
    v.g[name] = v.wrap((a: unknown[]) => {
      const args = toDyn(v, a, 0) as unknown[];
      let r: unknown;
      try { r = fn(args); } catch (e: any) { const err = new v.C.Error(e.message); if (e.name !== 'Error') err.name = e.name; throw err; }
      return toJs(v, r, 0);
    });
  },
  exposeAsync(h: number, name: string, start: (id: number, args: unknown[]) => void): void {
    const v = vmOf(h);
    if (!v) return;
    v.g[name] = v.wrap((a: unknown[]) => {
      const args = toDyn(v, a, 0) as unknown[];
      const id = ++v.nextId;
      const p = new v.C.Promise((res: AnyFn, rej: AnyFn) => { v.calls.set(id, [res, rej]); });
      start(id, args);
      return p;
    });
  },
  settle(h: number, id: number, ok: boolean, value: unknown, message: string): void {
    const v = vmOf(h);
    const c = v?.calls.get(id);
    if (!v || !c) return;
    v.calls.delete(id);
    entry(v, () => {
      if (ok) c[0](toJs(v, value, 0));
      else { const err = new v.C.Error(message); if (typeof value === 'string' && value !== 'Error') err.name = value; c[1](err); }
      v.drain.runInContext(v.ctx, timeout(v));  // the context's own microtask queue runs after an evaluation
      return undefined;
    });
  },
  interrupt(h: number): void { const v = vmOf(h); if (v && v.depth > 0) v.interrupted = true; },
  memoryUsed(_h: number): number { return 0; },
  onEvent(cb: (h: number, kind: number, id: number, v: unknown) => void): void { onEvent = cb; },
};
