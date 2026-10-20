import { bump } from './counter';
console.log('init math');
export const PI2: f64 = 6.28;
export function square(x: i32): i32 { bump(); return x * x; }
function hidden(): i32 { return 7; }
export function seven(): i32 { return hidden(); }
export { square as sq };
