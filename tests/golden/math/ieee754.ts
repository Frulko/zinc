// Math.sin, cos, tan, exp, log, pow and atan2 on 10000 arguments each, one result per line (ZN-703); every Zinc engine must print
// the lines of ieee754.out.gz, so the same bits. Plain TypeScript: the golden is the output of Node 24.14.0 for x86_64
// (`arch -x86_64 node ieee754.ts`, macOS), whose fdlibm has no fused multiply-add (Node for arm64 fuses some: 144 lines differ),
// with 13 pow lines where Apple's libm, which Node's pow calls, is not correctly rounded: those hold the correctly rounded value,
// checked with 100-digit decimals (the arguments and both values are in the notes of ZN-703).
// The arguments come from an LCG and powers of ten built with exact or correctly rounded steps, never from the functions tested.
let seed = 12345;
function next(): number {  // in [0, 1): 69069 * s + 1 stays below 2^53, so every step is exact
  seed = (69069 * seed + 1) % 4294967296;
  return seed / 4294967296;
}
function sym(): number { return next() * 2 - 1; }
const tens: number[] = [];
function ten(k: number): number { return tens[k + 330]; }
for (let k = -330; k <= 310; k++) tens.push(Number('1e' + k));

const N = 10000;
const out: string[] = [];
function line(v: number): void {
  out.push(String(v));
  if (out.length === 1000) { console.log(out.join('\n')); out.length = 0; }
}
function flush(): void {
  if (out.length > 0) console.log(out.join('\n'));
  out.length = 0;
}

console.log('sin');
for (let i = 0; i < N; i++) line(Math.sin(i % 50 === 0 ? sym() * ten(300) : sym() * ten(i % 26 - 9)));
flush();
console.log('cos');
for (let i = 0; i < N; i++) line(Math.cos(i % 50 === 0 ? sym() * ten(300) : sym() * ten(i % 26 - 9)));
flush();
console.log('tan');
for (let i = 0; i < N; i++) line(Math.tan(i % 50 === 0 ? sym() * ten(300) : sym() * ten(i % 26 - 9)));
flush();
console.log('exp');
for (let i = 0; i < N; i++) line(Math.exp(i % 4 === 0 ? sym() * 760 : sym() * ten(i % 12 - 9)));
flush();
console.log('log');
for (let i = 0; i < N; i++) line(Math.log(next() * ten(i % 625 - 320)));
flush();
console.log('pow');
for (let i = 0; i < N; i++) {
  if (i % 10 === 0) line(Math.pow(sym() * ten(i % 7 - 3), Math.floor(sym() * 40)));  // negative bases with integer exponents
  else line(Math.pow(next() * ten(i % 9 - 4), sym() * ten(i % 5 - 2)));
}
flush();
console.log('atan2');
for (let i = 0; i < N; i++) line(Math.atan2(sym() * ten(i % 11 - 5), sym() * ten(i % 13 - 6)));
flush();
console.log('special');  // the edges where JavaScript and C disagree (pow of ±1 and Infinity, NaN exponents) and the signs of zero
const inf = Infinity;
const sp: number[] = [Math.pow(1, inf), Math.pow(-1, -inf), Math.pow(1, NaN), Math.pow(NaN, 0), Math.pow(-inf, 0.5), Math.pow(-0, 0.5),
  Math.pow(0.1, 2), Math.pow(1e200, 2), Math.pow(2, 0.5), Math.pow(-8, 1 / 3), Math.pow(0, -1), Math.pow(-0, -3), Math.pow(-inf, -3),
  1 / Math.sin(-0), 1 / Math.tan(-0), Math.cos(inf), Math.exp(-inf), Math.exp(1), Math.log(0), Math.log(-1), 1 / Math.log(1),
  1 / Math.atan2(-0, 0), Math.atan2(-0, -0), Math.atan2(inf, -inf), Math.atan2(-1, -inf)];
for (const v of sp) line(v);
flush();
