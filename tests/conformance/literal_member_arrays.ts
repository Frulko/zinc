// Array literals inside unannotated object literals: the compiler looked for the member's declared type, found the
// literal itself and recursed until the stack overflowed (found by zinc compat, WPT encoding / test262 JSON).
const o = { b: [true, false], n: [1, 2.5], s: { t: ['x', 'y'] }, u: { v: [{ w: 1 }] } };
console.log(JSON.stringify(o), o.b.length, o.n[1], o.s.t[1], o.u.v[0].w);
const flags = { on: [true, null], off: [null, false] };
console.log(flags.on.length, flags.off.length);
