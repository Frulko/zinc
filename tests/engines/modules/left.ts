export let value: i32 = 7;
export function add(n: i32): i32 { value += n; return value; }
console.log('left', value);
export default function read(): i32 { return value; }
