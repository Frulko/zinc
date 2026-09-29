import { add as leftAdd } from './left';
export let value: i32 = 20;
export function add(n: i32): i32 { return value + leftAdd(n); }
console.log('right', value);
