// Zinc standard declarations. Replaces lib.*.d.ts (noLib: true). Only what the runtime implements (RT-08).

// ---- machine types (LNG-02); Sema reads these names syntactically ----
type i8 = number; type i16 = number; type i32 = number; type i64 = number;
type u8 = number; type u16 = number; type u32 = number; type u64 = number;
type f32 = number; type f64 = number; type isize = number; type usize = number;
/** Fixed point Q20.12 (PS1 GTE format) and Q16.16; bit-identical on every target (RT-04). */
type fx12 = number; type fx16 = number;

// ---- global types required by the TypeScript checker ----
interface Object {}
interface Function {}
interface CallableFunction extends Function {}
interface NewableFunction extends Function {}
interface IArguments {}
interface RegExp {}
interface Boolean {}
interface Symbol {}
interface SymbolConstructor { readonly iterator: unique symbol; readonly dispose: unique symbol; }
declare var Symbol: SymbolConstructor;
interface IteratorYieldResult<T> { done?: false; value: T; }
interface IteratorReturnResult<T> { done: true; value: T; }
type IteratorResult<T, R = any> = IteratorYieldResult<T> | IteratorReturnResult<R>;
interface Iterator<T, R = any, N = any> { next(...args: [] | [N]): IteratorResult<T, R>; }
interface Iterable<T, R = any, N = any> { [Symbol.iterator](): Iterator<T, R, N>; }
interface IterableIterator<T, R = any, N = any> extends Iterator<T, R, N> { [Symbol.iterator](): IterableIterator<T, R, N>; }
interface IteratorObject<T, R = any, N = any> extends Iterator<T, R, N> { [Symbol.iterator](): IteratorObject<T, R, N>; }
type BuiltinIteratorReturn = any;
interface ArrayIterator<T> extends IteratorObject<T, BuiltinIteratorReturn, unknown> { [Symbol.iterator](): ArrayIterator<T>; }
interface MapIterator<T> extends IteratorObject<T, BuiltinIteratorReturn, unknown> { [Symbol.iterator](): MapIterator<T>; }
interface SetIterator<T> extends IteratorObject<T, BuiltinIteratorReturn, unknown> { [Symbol.iterator](): SetIterator<T>; }
interface StringIterator<T> extends IteratorObject<T, BuiltinIteratorReturn, unknown> { [Symbol.iterator](): StringIterator<T>; }
interface TemplateStringsArray { readonly length: i32; }
interface Disposable { [Symbol.dispose](): void; }
type Partial<T> = { [P in keyof T]?: T[P] };
type Readonly<T> = { readonly [P in keyof T]: T[P] };
type Record<K extends keyof any, T> = { [P in K]: T };
interface ClassDecoratorContext<Class = unknown> { readonly kind: 'class'; readonly name: string | undefined; }
interface ClassFieldDecoratorContext<This = unknown, Value = unknown> { readonly kind: 'field'; readonly name: string | symbol; readonly static: boolean; readonly private: boolean; }

// ---- Number ----
interface Number { toFixed(digits?: i32): string; toString(): string; }
interface NumberConstructor {
  /** ToNumber of a number, boolean, string or Dyn (f64 profiles). */
  (value?: unknown): number;
  isNaN(n: number): boolean; isFinite(n: number): boolean; isInteger(n: number): boolean; isSafeInteger(n: number): boolean;
  parseFloat(s: string): number; parseInt(s: string, radix?: i32): number;
  readonly MAX_SAFE_INTEGER: number; readonly MIN_SAFE_INTEGER: number; readonly EPSILON: number;
  readonly MAX_VALUE: number; readonly MIN_VALUE: number; readonly NaN: number;
  readonly POSITIVE_INFINITY: number; readonly NEGATIVE_INFINITY: number;
}
interface BooleanConstructor {
  /** ToBoolean (truthiness). */
  (value?: unknown): boolean;
}
declare var Boolean: BooleanConstructor;
declare var Number: NumberConstructor;
declare function parseInt(s: string, radix?: i32): number;
declare function parseFloat(s: string): number;
declare function isNaN(n: number): boolean;
declare const NaN: number;
declare const Infinity: number;

// ---- String (UTF-8 storage, UTF-16 indices) ----
interface String {
  readonly length: i32;
  charCodeAt(i: i32): i32;
  charAt(i: i32): string;
  at(i: i32): string;
  slice(start: i32, end?: i32): string;
  substring(start: i32, end?: i32): string;
  indexOf(s: string, from?: i32): i32;
  lastIndexOf(s: string, from?: i32): i32;
  includes(s: string, position?: i32): boolean;
  startsWith(s: string, position?: i32): boolean;
  endsWith(s: string, endPosition?: i32): boolean;
  concat(s: string): string;
  split(sep: string): string[];
  /** Removes JS white space and line terminators (ASCII, U+00A0, U+FEFF, the Unicode Zs spaces, U+2028 / U+2029). */
  trim(): string;
  trimStart(): string;
  trimEnd(): string;
  padStart(n: i32, fill?: string): string;
  padEnd(n: i32, fill?: string): string;
  repeat(n: i32): string;
  toUpperCase(): string;
  toLowerCase(): string;
  replace(a: string, b: string): string;
  replaceAll(a: string, b: string): string;
  [Symbol.iterator](): StringIterator<string>;
}
interface StringConstructor {
  /** ToString, like a template literal. */
  (value?: unknown): string;
  fromCharCode(c: i32): string;
}
declare var String: StringConstructor;

// ---- Array (contiguous, no holes) ----
interface Array<T> {
  length: i32;
  [n: number]: T;
  push(v: T): i32;
  pop(): T;
  shift(): T;
  unshift(v: T): i32;
  slice(start?: i32, end?: i32): T[];
  splice(start: i32, count: i32): T[];
  indexOf(v: T, fromIndex?: i32): i32;
  lastIndexOf(v: T, fromIndex?: i32): i32;
  /** SameValueZero: NaN is found. */
  includes(v: T, fromIndex?: i32): boolean;
  find(f: (v: T, i: i32) => boolean): T | undefined;
  findIndex(f: (v: T, i: i32) => boolean): i32;
  findLast(f: (v: T, i: i32) => boolean): T | undefined;
  findLastIndex(f: (v: T, i: i32) => boolean): i32;
  some(f: (v: T, i: i32) => boolean): boolean;
  every(f: (v: T, i: i32) => boolean): boolean;
  map<U>(f: (v: T, i: i32) => U): U[];
  filter(f: (v: T, i: i32) => boolean): T[];
  reduce<U>(f: (acc: U, v: T, i: i32) => U, init: U): U;
  reduceRight<U>(f: (acc: U, v: T, i: i32) => U, init: U): U;
  forEach(f: (v: T, i: i32) => void): void;
  sort(cmp: (a: T, b: T) => number): T[];
  reverse(): T[];
  join(sep?: string): string;
  concat(other: T[]): T[];
  fill(v: T, start?: i32, end?: i32): T[];
  at(i: i32): T;
  [Symbol.iterator](): ArrayIterator<T>;
}
interface ReadonlyArray<T> { readonly length: i32; readonly [n: number]: T; }
interface ArrayConstructor { isArray(v: unknown): v is any[]; }
declare var Array: ArrayConstructor;

// ---- Map / Set (insertion ordered, LNG-19) ----
interface Map<K, V> {
  readonly size: i32;
  get(k: K): V | undefined;
  set(k: K, v: V): this;
  has(k: K): boolean;
  delete(k: K): boolean;
  clear(): void;
  forEach(f: (v: V, k: K) => void): void;
  keys(): K[];
  values(): V[];
  [Symbol.iterator](): MapIterator<[K, V]>;
}
interface MapConstructor { new <K, V>(): Map<K, V>; }
declare var Map: MapConstructor;
interface Set<T> {
  readonly size: i32;
  add(v: T): this;
  has(v: T): boolean;
  delete(v: T): boolean;
  clear(): void;
  forEach(f: (v: T) => void): void;
  values(): T[];
  [Symbol.iterator](): SetIterator<T>;
}
interface SetConstructor { new <T>(): Set<T>; }
declare var Set: SetConstructor;

// ---- Math ----
interface Math {
  readonly PI: number; readonly E: number;
  abs(x: number): number; min(...values: number[]): number; max(...values: number[]): number;
  floor(x: number): number; ceil(x: number): number; round(x: number): number; trunc(x: number): number;
  sign(x: number): number; sqrt(x: number): number; pow(x: number, y: number): number;
  sin(x: number): number; cos(x: number): number; tan(x: number): number; atan2(y: number, x: number): number;
  exp(x: number): number; log(x: number): number; hypot(a: number, b: number): number;
  fround(x: number): f32; imul(a: i32, b: i32): i32; clz32(x: i32): i32;
  /** Deterministic xorshift32; same sequence on sim and native. */
  random(): number;
  /** Zinc extension: reseed Math.random. */
  seed(s: u32): void;
}
declare var Math: Math;

// ---- misc ----
interface Console {
  log(...args: unknown[]): void; info(...args: unknown[]): void; debug(...args: unknown[]): void;
  warn(...args: unknown[]): void; error(...args: unknown[]): void; trace(...args: unknown[]): void;
  time(label?: string): void; timeEnd(label?: string): void; timeLog(label?: string): void; count(label?: string): void;
  assert(cond: boolean, ...args: unknown[]): void; table<T>(rows: T[]): void;
}
interface JSON {
  stringify<T>(v: T): string;
  /**
   * Untyped JSON becomes a Dyn tree (DYN-09): gradual profile only.
   * @throws on invalid input
   */
  parse(text: string): any;
}
declare var JSON: JSON;
declare function queueMicrotask(f: () => void): void;

// ---- Promise (LNG-16): futures resolved by the event loop ----
interface PromiseLike<T> { then(f: (v: T) => void): PromiseLike<void>; }
interface Promise<T> { then(f: (v: T) => void): Promise<void>; }
interface PromiseConstructor {
  new <T>(executor: (resolve: (value: T) => void, reject: (reason: Error) => void) => void): Promise<T>;
  resolve<T>(v: T): Promise<T>;
  resolve(): Promise<void>;
  reject<T = never>(e: Error): Promise<T>;
  all<T>(ps: Promise<T>[]): Promise<T[]>;
}
declare var Promise: PromiseConstructor;
interface Generator<T = unknown, R = any, N = any> extends IteratorObject<T, R, N> { [Symbol.iterator](): Generator<T, R, N>; }

// ---- memory (section 8) ----
/** MEM-07: `using a = Arena.frame()`; everything allocated until the end of the block is freed in O(1). */
declare class Arena {
  static frame(bytes?: i32): Arena;
  promote<T>(x: T): T;
  [Symbol.dispose](): void;
}
/** MEM-13: weak back-reference, does not keep the target alive. */
declare function weak(target: undefined, ctx: ClassFieldDecoratorContext): void;
/** MEM-09: N preallocated slots for this class. */
declare function pooled(n: i32): (target: Function, ctx: ClassDecoratorContext) => void;
/** LNG-10: value class (copied, no header). */
declare function value(target: Function, ctx: ClassDecoratorContext): void;
declare var console: Console;
interface DateConstructor { now(): number; }
declare var Date: DateConstructor;
interface Performance { now(): number; }
declare var performance: Performance;
declare function setTimeout(f: () => void, ms: number): i32;
declare function setInterval(f: () => void, ms: number): i32;
declare function clearTimeout(id: i32): void;
declare function clearInterval(id: i32): void;

interface Error { message: string; name: string; }
interface ErrorConstructor { new (message?: string): Error; }
declare var Error: ErrorConstructor;
declare var TypeError: ErrorConstructor;
declare var RangeError: ErrorConstructor;

// ---- Zinc intrinsics ----
declare function unchecked<T>(v: T): T;
/**
 * Any function, called with an array of dynamic arguments and returning a dynamic value: `(args: unknown[]) =>
 * unknown` at run time. A typed function passed where a DynFunction is expected, e.g. `(r: i32, name: string) =>
 * void`, gets an adapter that converts each argument JavaScript-style (ToNumber then the machine type, String(x),
 * truthiness; `unknown` as is; missing arguments are undefined) and boxes the result. Parameters must be annotated
 * number / machine numbers, string, boolean or unknown. Used by zinc:script host functions.
 */
type DynFunction = (...args: never[]) => unknown;
