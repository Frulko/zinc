// ZN-099: the cost of a native call (CallNative of the C test module): 20 million i32 additions and 2 million string calls, timed by the host.
import { NativeModule, requireNative } from 'zinc:native';
interface Spec extends NativeModule { add(a: i32, b: i32): i32; greet(name: string): string }
const n = requireNative<Spec>('Fixture');
let s: i32 = 0;
for (let i: i32 = 0; i < 20000000; i++) s = n.add(s, 1);
console.log(s);
let g = 0;
for (let i: i32 = 0; i < 2000000; i++) g += n.greet('zinc').length;
console.log(g);
