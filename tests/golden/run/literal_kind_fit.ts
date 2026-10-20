// An integer literal takes the machine kind of the other operand only when it fits that kind; otherwise the arithmetic is a double, as in JavaScript.
let seed = 123456789;
function next(): number { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; }
const a = next();
console.log((a >>> 11) * 4294967296 + next() > 4294967296, (a >>> 0) * 4294967296 === a * 4294967296, (a | 0) + 3000000000 === (a | 0) + 3e9, (a & 255) * 300 === (a & 255) * 300.0);
const b: u8 = 200;
console.log(b * 300, b + 100, (b | 0) * 1e10);
