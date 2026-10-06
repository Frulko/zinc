// arr.sort((a, b) => a - b) and (a, b) => b - a on an f64[] run without a call per comparison; the result is the one the generic comparator path gives, NaN, infinities and
// signed zeros included (the second copy uses a comparator the optimizer does not recognise).
let seed: u32 = 12345;
function next(): u32 { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; }
function sameBits(a: number, b: number): boolean {
  if (a !== a) return b !== b;
  return a === b && 1 / a === 1 / b;
}
function make(withNaN: boolean): number[] {
  const r: number[] = [];
  for (let i: i32 = 0; i < 300; i++) {
    const k = next() % 12;
    if (k === 0) r.push(0);
    else if (k === 1) r.push(-0);
    else if (k === 2) r.push(Infinity);
    else if (k === 3) r.push(-Infinity);
    else if (k === 4 && withNaN) r.push(NaN);
    else r.push((next() % 40) - 20);
  }
  return r;
}
let ok = 0;
for (let round: i32 = 0; round < 4; round++) {
  const nan = round % 2 === 1;
  const a = make(nan);
  const b = a.slice();
  const c = a.slice();
  const d = a.slice();
  a.sort((x: number, y: number) => x - y);
  b.sort((x: number, y: number) => (x - y) + 0);
  c.sort((x: number, y: number) => y - x);
  d.sort((x: number, y: number) => (y - x) + 0);
  let same = true;
  for (let i: i32 = 0; i < a.length; i++) if (!sameBits(a[i], b[i]) || !sameBits(c[i], d[i])) same = false;
  if (same) ok++;
}
console.log(ok);
const small: number[] = [3, 1, 2];
small.sort((x: number, y: number) => x - y);
console.log(small[0], small[1], small[2]);
