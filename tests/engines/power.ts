const base: f64 = 2;
console.log('powers', base ** 3, base ** -2, (-base) ** 3, base ** 0);
console.log('edges', 0 ** 0, (-base) ** 0.5, 1 ** (1 / 0));
let counter: i32 = 0;
function next(): f64 { counter++; return counter + 1; }
console.log('order', next() ** next(), counter);
let powered: f64 = 3;
powered **= 2;
console.log('compound', powered);
