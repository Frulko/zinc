// A number or a string as a condition follows JavaScript truthiness (0, NaN and '' are false).
let n: i32 = 1;
if (n) n = 2;
const s: string = '';
console.log(n, s ? 'full' : 'empty', !n);
