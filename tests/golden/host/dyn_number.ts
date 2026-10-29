// Number() of a dynamic value (any, unknown) converts as JavaScript does: a number as it is, a string parsed, a boolean 1 or 0, null 0,
// undefined and an object NaN.
const v: any = JSON.parse('{"n": 42.5, "s": " 7 ", "b": true, "z": null, "e": "x", "o": {}}');
console.log(Number(v.n), Number(v.s), Number(v.b), Number(v.z), Number(v.e), Number(v.missing), Number(v.o));
const u: unknown = v.n;
console.log(Number(u) + 1);
