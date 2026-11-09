// Machine number kinds give the same results on every engine (ZN-796): i32/u32 wrap, narrow kinds wrap on store, f32 rounds, an integer
// store truncates. QuickJS gets them from the wraps src/qjs/strip.cpp writes into the JavaScript.
const a: i32 = 2147483647;
console.log(a + 1, a + a > 0, -a - 2);
const b: u8 = 250;
console.log(b + 10, -b);
let c: u8 = 250; c += 10; console.log(c);
const f: f32 = 0.1;
const g: f32 = 0.2;
console.log(f + g, f * g, f + 1);
let z: i32 = 1; z = 7 / 2; console.log(z);
z = -7 / 2; console.log(z);
z = 2147483647; z += 1; console.log(z);
z /= 3; console.log(z);
let w = 1; w = 7 / 2; console.log(w);
let m: i32 = 1000000; console.log(m * m);
let n: i32 = 7; n++; n *= 3; console.log(n, n / 2, n % 4, -n >> 1);
function h(x: i32): i32 { return x * 3 / 2; }
console.log(h(5), h(7 / 2));
const sq = (v: i32): i32 => v * v;
console.log(sq(65536), sq(3.7 as i32), (7 / 2) as i32);
const arr: i32[] = [1, 2]; arr[0] = 7 / 2; console.log(arr[0]);
const bytes: u8[] = [300, 7]; console.log(bytes[0]);
let u: u32 = 0; u = u - 1; console.log(u);
const big: u32 = 4000000000; console.log(big + big, big * 3);
let s: i8 = 1; s = 200; console.log(s);
let k: u8 = 255; k++; console.log(k);
let q: u8 = 0; console.log(q--, q);
const r = a + 1; console.log(r);
let i16v: i16 = 1; i16v = i16v + 40000; console.log(i16v);
class P {
  x: i32 = 0;
  f: f32 = 0;
  step(): void { this.x += 2147483647; this.x += 2; this.f = 0.1; this.f += 1; }
  twice(v: i32): i32 { return v + v; }
  run(): i32 { return this.twice(2000000000); }
}
const p = new P(); p.step(); console.log(p.x, p.f, p.run());
let sum: i32 = 0;
for (let i: i32 = 0; i < 3; i++) sum += 1500000000;
console.log(sum);
// arrays of a machine kind are not numbers: a field, a return and a default stay arrays
class Bag { xs: i32[] = []; add(v: i32): void { this.xs.push(v); } }
function bytesOf(n: i32, fill: u8[] = []): u8[] { for (let i: i32 = 0; i < n; i++) fill.push(250 + i); return fill; }
const bag = new Bag(); bag.add(7 / 2); console.log(bag.xs.length, bytesOf(3).join(','));
