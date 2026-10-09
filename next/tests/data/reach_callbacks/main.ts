// Functions reached only through objects (ZN-431): see tests/t1/reach_callbacks.sh: promise jobs, timers, onFrame and callbacks kept; a class never built loses its methods.
import { onFrame } from 'zinc:gfx';

class Unused { get(): i32 { return 99; } }
abstract class Shape { abstract area(): number; }
class Sq extends Shape { constructor(private s: number) { super(); } area(): number { return this.s * this.s; } }
class Never extends Shape { area(): number { return -1; } }

function later(n: i32): Promise<i32> { return new Promise<i32>((resolve) => { setTimeout(() => resolve(n * 2), 1); }); }
const shapes: Shape[] = [new Sq(3)];
const sorted = [3, 1, 2].sort((a: number, b: number) => a - b);
console.log('start', shapes[0].area(), sorted.join(','));
Promise.resolve<i32>(5).then((v: i32) => console.log('job', v));
later(21).then((v: i32) => console.log('timer', v));
let frames = 0;
onFrame((dt: number) => { frames++; if (frames === 2) console.log('frame', frames); });
const parsed: any = JSON.parse('{"a": [1, 2, 3], "b": {"c": "deep"}}');   // DynObj / DynArr / DynNum: built by the runtime, never with `new`
console.log('json', parsed.a[2], parsed.b.c);
