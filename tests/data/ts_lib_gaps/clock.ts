// zinc:sys clock() reads below the millisecond: a short loop measures more than 0 and less than a second, and the readings are not whole milliseconds
import { clock } from 'zinc:sys';
let fractional = false;
let ok = true;
for (let round = 0; round < 5; round++) {
  const a = clock();
  let s = 0;
  for (let i = 0; i < 20000; i++) s += i % 7;
  const b = clock();
  if (!(b - a > 0 && b - a < 1000) || s !== 59997) ok = false;
  if (a !== Math.floor(a) || b !== Math.floor(b)) fractional = true;
}
console.log(ok && fractional ? 'clock ok' : 'clock coarse');
