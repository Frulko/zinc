// Native module callbacks and promises (ZN-167, the C99 test module of tests/native): a closure passed to a native export, called during the call and later from the loop
// (posted by a thread), a callback that returns a value, and promises settled from another thread.
import { NativeModule, requireNative } from 'zinc:native';

interface Spec extends NativeModule {
  setCallback(cb: (n: i32, text: string) => void): void;
  fire(n: i32): void;
  callSum(cb: (id: i32, x: f64) => f64): f64;
  postFromThread(): void;
  later(n: i32): Promise<i32>;
  laterFail(): Promise<i32>;
}
const n = requireNative<Spec>('Fixture');

const seen: string[] = [];
n.setCallback((k: i32, text: string) => { seen.push(k + ':' + text); });
n.fire(21);
console.log(seen.join(' '));
console.log(n.callSum((id: i32, x: f64): f64 => id * x));

async function main(): Promise<void> {
  console.log(await n.later(5));
  try { await n.laterFail(); } catch (e) { console.log('rejected:', e.message); }
  n.postFromThread();
  await new Promise<void>((resolve) => { setTimeout(() => { resolve(); }, 200); });
  console.log(seen.join(' '));
}
main();
