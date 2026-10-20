// A native module (the C99 test module of tests/native) called through requireNative<Spec>: scalars, strings and byte arrays, interpreted and compiled.
import { NativeModule, requireNative } from 'zinc:native';
interface Spec extends NativeModule {
  add(a: i32, b: i32): i32;
  scale(a: f64, b: f64): f64;
  greet(name: string): string;
  sum(b: u8[]): i32;
  reverse(b: u8[]): u8[];
}
const n = requireNative<Spec>('Fixture');
console.log(n.add(2, 3), n.scale(1.5, 4), n.greet('zinc'));
const r = n.reverse([1, 2, 3, 250]);
console.log(n.sum([1, 2, 3, 250]), r.length, r[0], r[3]);
