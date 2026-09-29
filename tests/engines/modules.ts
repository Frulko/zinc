import { bump, value as leftValue } from './modules/barrel';
import * as right from './modules/right';
let value: i32 = 100;
function add(n: i32): i32 { return value + n; }
console.log(bump(2), leftValue, right.add(3), right.value, add(1));
import read from './modules/left';
console.log(read(), bump(1), read());
