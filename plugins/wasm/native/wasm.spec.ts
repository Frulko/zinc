// zinc:wasm native side: the wasm3 interpreter (vendor/wasm3, MIT) over integer handles.
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** Parses (validates) a module: a handle, or -1 (see error()). */
  compile(bytes: u8[]): i32;
  /** Imports as lines "module\tname\tkind" (kind: function, memory, table, global). */
  imports(m: i32): string;
  /** Exports as lines "name\tkind". */
  exports(m: i32): string;
  /** A new instance of a compiled module (a fresh copy): a handle, or -1. Link imports, then start(). */
  instantiate(m: i32): i32;
  /** Routes the import module.name to the onImport callback with this id; false when the module has no such
   *  function import. */
  linkImport(inst: i32, module: string, name: string, id: i32): boolean;
  /** Checks that every function import is linked (LinkError text in error()), then runs the start function. */
  start(inst: i32): boolean;
  /** Calls an exported function; the result as f64 (0 for none; see error() when it trapped: returns NaN and sets
   *  failed()). */
  call(inst: i32, name: string, args: f64[]): f64;
  failed(): boolean;
  /** 'function' parameter count, -1 when there is no such export. */
  argCount(inst: i32, name: string): i32;
  memorySize(inst: i32): i32;
  memoryRead(inst: i32, offset: i32, n: i32): u8[];
  memoryWrite(inst: i32, offset: i32, data: u8[]): boolean;
  /** Value of an exported global (NaN when missing). */
  globalGet(inst: i32, name: string): f64;
  free(inst: i32): void;
  error(): string;
  /** Host functions: cb(id, args) returns the result (ignored for void imports). */
  onImport(cb: (id: i32, args: f64[]) => f64): void;
}
export default requireNative<Spec>('Wasm');
