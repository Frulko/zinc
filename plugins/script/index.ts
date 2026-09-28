// zinc:script — runtime scripting (docs/plugins/script.md). A Script is a sandboxed JavaScript context: it sees the
// language built-ins and what the host exposes, nothing else (no files, no network, no timers). Values cross as Dyn
// (numbers, strings, booleans, arrays, plain objects; script functions as ScriptFunction handles); script errors are
// thrown as ScriptError with the script's file, line and stack. The engine sits behind the ScriptEngine interface:
// 'quickjs' (QuickJS-ng, native/quickjs.*) today, 'zinc-vm' (typed register bytecode, docs/reports/zinc-vm.md) later.
import * as assets from 'zinc:assets';
import Q from './native/quickjs.spec';

export interface ScriptOptions {
  /** 'quickjs' (default). 'zinc-vm' is reserved for the Zinc VM engine. */
  engine?: string;
  /** Bytes the engine may allocate (default 16 MiB, 0 = no limit). Exceeding it throws a ScriptError of kind 'memory'. */
  memoryLimit?: number;
  /** Milliseconds one host -> script entry (eval, call, a promise settling) may run (default 1000, 0 = no limit). */
  timeLimitMs?: number;
  /** Bytes of native stack the engine may use (default 512 KiB). */
  stackSize?: number;
  /** Imports of modules that were not defined are read from the app's assets (default false). */
  importAssets?: boolean;
}

/** What the engine reports about a failure (the shape of `ScriptEngine` errors). */
export interface ErrorInfo {
  /** 'error' (thrown by the script), 'syntax', 'timeout', 'memory', 'interrupted' or 'host' (bad use of the API). */
  kind: string;
  /** Name of the script's error ('TypeError', 'ReferenceError', ...); '' when the script threw a non-Error value. */
  type: string;
  message: string;
  /** Script file and 1-based line of the innermost script frame (0 when unknown: limits, host errors). */
  file: string;
  line: number;
  /** Script frames, one per line: `at fn (file:line:col)` or `at file:line:col`. */
  stack: string;
}

/** A script failure, thrown by eval / call / load and rejected by the async variants. */
export class ScriptError extends Error {
  kind: string;
  type: string;
  file: string;
  line: i32;
  stack: string;
  constructor(i: ErrorInfo) {
    super(i.type.length > 0 ? `${i.type}: ${i.message}` : i.message);
    this.name = 'ScriptError';
    this.kind = i.kind; this.type = i.type; this.file = i.file; this.line = i.line; this.stack = i.stack;
  }
}

/**
 * The engine contract (docs/plugins/script.md). Every method that runs script code throws ScriptError; results and
 * arguments are Dyn values (JSON-like data, plus function handles). An engine must enforce the memory and time
 * limits it was created with, keep scripts away from anything the host did not expose, and run pending promise
 * jobs before an entry returns.
 */
export interface ScriptEngine {
  readonly name: string;
  eval(src: string, file: string): unknown;
  evalAsync(src: string, file: string): Promise<unknown>;
  define(name: string, src: string): void;
  load(name: string, src: string): void;
  call(fn: string, args: unknown[]): unknown;
  callAsync(fn: string, args: unknown[]): Promise<unknown>;
  set(name: string, value: unknown): void;
  get(name: string): unknown;
  expose(name: string, fn: DynFunction): void;
  exposeAsync(name: string, fn: (args: unknown[]) => Promise<unknown>): void;
  /** Function handles: a named global / export, or a function value from the script; -1 if not a function. */
  ref(name: string): i32;
  refValue(v: unknown): i32;
  callRef(ref: i32, args: unknown[]): unknown;
  unref(ref: i32): void;
  interrupt(): void;
  memoryUsed(): number;
  dispose(): void;
}

// ---------------------------------------------------------------- QuickJS engine (native/quickjs.*)
const engines: (QuickJSEngine | null)[] = [];
let listening = false;
function listen(): void {
  if (listening) return;
  listening = true;
  Q.onEvent((h: i32, kind: i32, id: i32, v: unknown) => {
    const e = h >= 0 && h < engines.length ? engines[h] : null;
    if (e !== null) e.settled(kind, id, v);
  });
}
function hostError(message: string): ScriptError {
  return new ScriptError({ kind: 'host', type: 'Error', message: message, file: '', line: 0, stack: '' });
}
/** Runs an async host function for the script and settles the script's promise with its outcome. */
async function runAsync(h: i32, id: i32, fn: (args: unknown[]) => Promise<unknown>, args: unknown[]): Promise<void> {
  try {
    const v = await fn(args);
    Q.settle(h, id, true, v, '');
  } catch (e) {
    Q.settle(h, id, false, e.name, e.message);
  }
}

class QuickJSEngine implements ScriptEngine {
  readonly name: string = 'quickjs';
  readonly h: i32;
  private resolves: Map<i32, (v: unknown) => void> = new Map<i32, (v: unknown) => void>();
  private rejects: Map<i32, (e: Error) => void> = new Map<i32, (e: Error) => void>();

  constructor(memoryLimit: number, timeLimitMs: number, stackSize: number, importAssets: boolean) {
    listen();
    this.h = Q.create(memoryLimit, timeLimitMs, stackSize);
    if (this.h < 0) throw hostError('zinc:script: cannot create a QuickJS context');
    while (engines.length <= this.h) engines.push(null);
    engines[this.h] = this;
    if (importAssets) Q.resolver(this.h, (name: string) => assets.exists(name) ? assets.readText(name) : '');
  }
  private fail(): ScriptError { return new ScriptError(Q.error(this.h) as ErrorInfo); }
  private follow(id: i32): Promise<unknown> {
    if (id < 0) return Promise.reject<unknown>(this.fail());
    if (id === 0) return Promise.resolve<unknown>(Q.result(this.h));
    return new Promise<unknown>((resolve: (v: unknown) => void, reject: (e: Error) => void) => {
      this.resolves.set(id, resolve);
      this.rejects.set(id, reject);
    });
  }
  settled(kind: i32, id: i32, v: unknown): void {
    if (!this.resolves.has(id)) return;
    const resolve = this.resolves.get(id)!, reject = this.rejects.get(id)!;
    this.resolves.delete(id);
    this.rejects.delete(id);
    if (kind === 1) resolve(v);
    else reject(new ScriptError(v as ErrorInfo));
  }

  eval(src: string, file: string): unknown {
    if (!Q.eval(this.h, src, file)) throw this.fail();
    return Q.result(this.h);
  }
  evalAsync(src: string, file: string): Promise<unknown> { return this.follow(Q.evalAsync(this.h, src, file)); }
  define(name: string, src: string): void { Q.define(this.h, name, src); }
  load(name: string, src: string): void { if (!Q.load(this.h, name, src)) throw this.fail(); }
  call(fn: string, args: unknown[]): unknown {
    if (!Q.call(this.h, fn, args)) throw this.fail();
    return Q.result(this.h);
  }
  callAsync(fn: string, args: unknown[]): Promise<unknown> { return this.follow(Q.callAsync(this.h, fn, args)); }
  set(name: string, value: unknown): void { if (!Q.set(this.h, name, value)) throw this.fail(); }
  get(name: string): unknown {
    if (!Q.get(this.h, name)) throw this.fail();
    return Q.result(this.h);
  }
  expose(name: string, fn: DynFunction): void { Q.expose(this.h, name, fn); }
  exposeAsync(name: string, fn: (args: unknown[]) => Promise<unknown>): void {
    const h = this.h;
    Q.exposeAsync(h, name, (id: i32, args: unknown[]) => { runAsync(h, id, fn, args); });
  }
  ref(name: string): i32 { return Q.refNamed(this.h, name); }
  refValue(v: unknown): i32 { return Q.refValue(this.h, v); }
  callRef(ref: i32, args: unknown[]): unknown {
    if (!Q.callRef(this.h, ref, args)) throw this.fail();
    return Q.result(this.h);
  }
  unref(ref: i32): void { Q.unref(this.h, ref); }
  interrupt(): void { Q.interrupt(this.h); }
  memoryUsed(): number { return Q.memoryUsed(this.h); }
  dispose(): void {
    if (engines[this.h] !== this) return;
    engines[this.h] = null;
    Q.destroy(this.h);
    const pending: ((e: Error) => void)[] = [];
    this.rejects.forEach((reject: (e: Error) => void) => { pending.push(reject); });
    this.resolves.clear();
    this.rejects.clear();
    for (const reject of pending) reject(hostError('zinc:script: the script was disposed'));
  }
}

// ---------------------------------------------------------------- the host-facing API
/** A function of the script, callable from the host until released. */
export class ScriptFunction {
  readonly engine: ScriptEngine;
  readonly ref: i32;
  constructor(engine: ScriptEngine, ref: i32) { this.engine = engine; this.ref = ref; }
  call(args: unknown[]): unknown { return this.engine.callRef(this.ref, args); }
  release(): void { this.engine.unref(this.ref); }
}

/** Picks the engine named in the options. */
export function createEngine(o: ScriptOptions): ScriptEngine {
  const name = o.engine ?? 'quickjs';
  if (name === 'quickjs')
    return new QuickJSEngine(o.memoryLimit ?? 16 * 1024 * 1024, o.timeLimitMs ?? 1000, o.stackSize ?? 512 * 1024, o.importAssets ?? false);
  if (name === 'zinc-vm') throw hostError("zinc:script: the 'zinc-vm' engine is not available yet (docs/plugins/script.md)");
  throw hostError(`zinc:script: unknown engine '${name}'`);
}

/**
 * A sandboxed script context.
 *
 *   const vm = new Script({ memoryLimit: 8 << 20, timeLimitMs: 50 });
 *   vm.expose('log', (msg: string) => console.log('[script]', msg));
 *   vm.eval('log("1 + 2 = " + (1 + 2))');
 */
export class Script {
  readonly engine: ScriptEngine;
  constructor(o: ScriptOptions) { this.engine = createEngine(o); }
  /** Makes `fn` a global function of the script. Its parameters are annotated number (or a machine number),
   *  string, boolean or unknown: arguments are converted like JavaScript does (Number(x), String(x), !!x). A throw
   *  in `fn` becomes an Error in the script. */
  expose(name: string, fn: DynFunction): void { this.engine.expose(name, fn); }
  /** A global function returning a promise to the script, settled when `fn`'s promise settles. */
  exposeAsync(name: string, fn: (args: unknown[]) => Promise<unknown>): void { this.engine.exposeAsync(name, fn); }
  /** Sets global `name` to a copy of `value` (JSON-like data; objects of Zinc classes are copied field by field). */
  set(name: string, value: unknown): void { this.engine.set(name, value); }
  /** A copy of global `name` (undefined if absent). */
  get(name: string): unknown { return this.engine.get(name); }
  /** Runs a classic script and returns its completion value (`vm.eval('1 + 2')` is 3). */
  eval(src: string, file: string = 'script.js'): unknown { return this.engine.eval(src, file); }
  /** Like eval; when the result is a promise, resolves with its value once the script's jobs settle it. */
  evalAsync(src: string, file: string = 'script.js'): Promise<unknown> { return this.engine.evalAsync(src, file); }
  /** Registers an ES module for `import` without running it. */
  define(name: string, src: string): void { this.engine.define(name, src); }
  /** Runs an ES module; its exports can be called with call(). Imports resolve to defined / loaded modules. */
  load(name: string, src: string): void { this.engine.load(name, src); }
  /** Runs an ES module read from the app's assets. */
  loadAsset(name: string): void {
    if (!assets.exists(name)) throw hostError(`zinc:script: asset not found: ${name}`);
    this.engine.load(name, assets.readText(name));
  }
  /** Calls a global function (or an export of a loaded module). */
  call(fn: string, args: unknown[]): unknown { return this.engine.call(fn, args); }
  /** Calls a function and, when it returns a promise, waits for it. */
  callAsync(fn: string, args: unknown[]): Promise<unknown> { return this.engine.callAsync(fn, args); }
  /** A handle on a global function or export, or null. */
  fn(name: string): ScriptFunction | null {
    const r = this.engine.ref(name);
    return r < 0 ? null : new ScriptFunction(this.engine, r);
  }
  /** A handle on a function value received from the script (e.g. a callback argument of a host function), or null. */
  toFunction(v: unknown): ScriptFunction | null {
    const r = this.engine.refValue(v);
    return r < 0 ? null : new ScriptFunction(this.engine, r);
  }
  /** Stops the running script at its next check (call it from a host function). */
  interrupt(): void { this.engine.interrupt(); }
  /** Bytes currently allocated by the engine. */
  memoryUsed(): number { return this.engine.memoryUsed(); }
  /** Frees the context; pending async results reject. */
  dispose(): void { this.engine.dispose(); }
}
