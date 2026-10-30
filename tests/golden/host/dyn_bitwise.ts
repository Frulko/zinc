// Bitwise operators on any (& | ^ << >> >>> and their compound forms), as in TypeScript: the operand is converted to a number (tests/t0/dyn_bitwise.sh).
const m: any = JSON.parse('{"flags":4100,"s":"12","neg":-8,"o":{"f":6}}');
const flags: number = m.flags;
console.log((m.flags & 4096) !== 0, m.flags | 1, m.flags ^ 4, m.s << 2, m.neg >> 1, m.neg >>> 28, 3 & m.flags, ((typeof m.flags === 'number' ? m.flags : 0) & 4096) !== 0, flags & 4);
m.o.f &= 3; m.o.f |= 8; m.o.f <<= 1;
console.log(m.o.f);
