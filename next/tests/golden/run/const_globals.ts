// Module-level constants read in loops, functions and closures (ZN-404: folded into the code, the same values as the globals).
const GRAVITY = 240;
const SCALE: number = 4 * Math.PI * Math.PI;
const LIMIT: i32 = 7;
const ON = true;
let changing = 1;   // written more than once: stays a global

function fall(dt: number): number { return GRAVITY * dt; }
function sum(): number {
  let s = 0;
  for (let i: i32 = 0; i < LIMIT; i++) s += GRAVITY / (i + 1) + SCALE;
  return s;
}
const scaled = (k: number): number => k * SCALE + (ON ? 1 : 0);
const counter = (): i32 => { changing = changing * 2; return LIMIT + (changing as i32); };

console.log(fall(0.5), sum().toFixed(6), scaled(2).toFixed(6));
console.log(counter(), counter(), changing);
let acc = 0;
for (let i: i32 = 0; i < LIMIT; i++) acc += GRAVITY;
console.log(acc, ON, LIMIT);
