// zinc:script engine 'quickjs', native side (docs/plugins/script.md). One handle per Script: a JSRuntime + JSContext
// (QuickJS-ng, vendor/quickjs) on macos / linux / rpi1 / rmpp, node:vm on the sim. Values cross as Dyn; a call that
// fails returns false (or -1) and leaves its description in error(h).
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** New sandboxed context: memoryLimit bytes (0 = none), timeLimitMs per host -> script entry (0 = none), stack
   *  bytes. -1 when it cannot be created. */
  create(memoryLimit: f64, timeLimitMs: f64, stackSize: f64): i32;
  /** Frees the context (deferred while the script is running, e.g. from a host function). */
  destroy(h: i32): void;
  /** Classic script (global code); the completion value is left in result(h). */
  eval(h: i32, src: string, file: string): boolean;
  /** Like eval, but a promise result is followed: 0 = value ready in result(h), n > 0 = pending, events settle it
   *  (kind 1 / 2 with id n); -1 = error. */
  evalAsync(h: i32, src: string, file: string): i32;
  /** Registers an ES module source for imports, without evaluating it. */
  define(h: i32, name: string, src: string): void;
  /** Source of an imported module that was not defined ('' = not found). */
  resolver(h: i32, fn: (name: string) => string): void;
  /** Defines and evaluates an ES module; its exports become visible to call(). */
  load(h: i32, name: string, src: string): boolean;
  /** Calls global function `fn` (else an export of a loaded module, latest first); result in result(h). */
  call(h: i32, fn: string, args: unknown[]): boolean;
  /** Same as call; a promise result is followed like evalAsync. */
  callAsync(h: i32, fn: string, args: unknown[]): i32;
  /** Calls a function handle (ref) with args. */
  callRef(h: i32, ref: i32, args: unknown[]): boolean;
  /** Handle of a script function: a global / export named `name`, or -1. */
  refNamed(h: i32, name: string): i32;
  /** Handle of a function value that came out of the script (an argument of a host function, a result), or -1. */
  refValue(h: i32, v: unknown): i32;
  unref(h: i32, ref: i32): void;
  set(h: i32, name: string, v: unknown): boolean;
  get(h: i32, name: string): boolean;
  /** Last value (eval, call, get). */
  result(h: i32): unknown;
  /** Last error: { kind, type, message, file, line, stack }. */
  error(h: i32): unknown;
  /** Host function: the script calls `name(...)`, fn gets the arguments, its result goes back (a throw rethrows). */
  expose(h: i32, name: string, fn: DynFunction): void;
  /** Async host function: the script gets a promise; start(id, args) must end with settle(h, id, ...). */
  exposeAsync(h: i32, name: string, start: (id: i32, args: unknown[]) => void): void;
  /** Settles the promise of an async host call (ok: resolve with value; else reject with Error(message)). */
  settle(h: i32, id: i32, ok: boolean, value: unknown, message: string): void;
  /** Asks a running script to stop (from a host function); the entry fails with kind 'interrupted'. */
  interrupt(h: i32): void;
  /** Bytes allocated by the engine. */
  memoryUsed(h: i32): f64;
  /** Settlement of evalAsync / callAsync results: kind 1 resolved (value), 2 rejected (error object as value). */
  onEvent(cb: (h: i32, kind: i32, id: i32, value: unknown) => void): void;
}
export default requireNative<Spec>('QuickJS');
