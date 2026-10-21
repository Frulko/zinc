// TypeScript beyond the Zinc subset, as libraries write it (Athena Crisis, kirari): parsed by the shared parser and erased on this engine; the
// typed engines report what they do not type yet (Z0005), never a syntax error. Then a CommonJS file imported with its own require.
import type { Shape2 } from './shapes';
import type Unused from './shapes';
export type { Id } from './shapes';
import cjs from './counter.cjs';
type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type Pick1<T, K extends keyof T> = T[K];
type IsStr<T> = T extends string ? 'yes' : 'no';
type Hex = `#${string}`;
type Labeled = readonly [x: number, y?: number, ...rest: string[]];
type Both = { a: number } & { b: string };
type Fn = <T>(x: T) => T;
type Ctor = new (n: number) => object;
type Neg = -1 | -2;
interface Api { call(x: number): string; get size(): number; [key: string]: unknown; <T>(v: T): T; generic<T>(v: T): T }
const AIID = { A: 0, B: 1 } as const;
type AIIDT = (typeof AIID)[keyof typeof AIID];
enum Op { '≤' = '≤', Plus = '+' }
const pick = <T extends object, K extends keyof T>(o: T, k: K): T[K] => o[k];
const id = <T,>(x: T): T => x;
const names = { 1: 'one', 2: 'two' };
const [, second] = [1, 2];
const { a, ...rest } = { a: 1, b: 2, c: 3 };
function f({ colors }: { colors: boolean } = { colors: true }): boolean { return colors; }
class Base { constructor(public n: number) {} }
class Child extends Base {
  constructor(n: number, private readonly k: number) { const m = n * 2; super(m); }
  sum(): number { return this.n + this.k; }
  twice<T>(x: T): readonly T[] { return [x, x]; }
}
const hex: Hex = '#fff';
const both: Both = { a: 1, b: 'x' };
const value = await Promise.resolve(41);
console.log(pick({ q: 3 }, 'q'), id('s'), names[2], second, a, JSON.stringify(rest), f(), new Child(2, 3).sum(), new Child(1, 1).twice('t').length, Op['≤'], hex, both.b, value + 1);
console.log(cjs.next(), cjs.next(), cjs.name);
