// Number to string against Node: the edge cases of ECMAScript Number::toString and a million doubles of every magnitude from a fixed generator, hashed (FNV-1a over the
// UTF-8 bytes of the strings joined with newlines). The generator makes m * 2^e with a 53-bit m and e from -1074 to 971, exactly the same arithmetic in both engines.
function fnv(h: number, s: string): number {
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return Math.imul(h ^ 10, 16777619);
}
const edge = [0, -0, 1, -1, 0.1, 0.5, 1.5, 100, 123456789, 1e21, 1e-7, 1e-6, 123456789012345680000, 1.7976931348623157e308, 5e-324, 2.2250738585072014e-308, 0.000001, 0.0000001,
  1234.5678, 4.35, 0.3, 9007199254740991, 9007199254740992, 1e22, 1e23, 4294967296, 2 ** 53 + 2, -1e-7, 123e-20, 100000000000000000000, 1e300, 5e-7, 1.5e-9, 0.1 + 0.2, 1 / 3, 2 / 3, 1e21 + 1, 999999999999999900000, 1.2e-10];
const parts: string[] = [];
for (const v of edge) parts.push(String(v));
console.log(parts.join(' '));
let seed = 123456789;
function next(): number {   // xorshift32
  seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
  return seed >>> 0;
}
let h = 2166136261;
for (let i = 0; i < 1000000; i++) {
  const m = (next() >>> 11) * 4294967296 + next();   // up to 2^53
  const e = (next() % 2046) - 1074;                  // -1074 .. 971
  let v = m;
  let k = e;
  while (k > 500) { v *= 2 ** 500; k -= 500; }
  while (k < -500) { v *= 2 ** -500; k += 500; }
  v *= 2 ** k;
  h = fnv(h, String(v));
}
console.log('hash', h >>> 0);
