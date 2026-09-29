import Callbacks from './callbacks/callbacks.spec';
Callbacks.keep((n: i32): i32 => n + 1);
let total: number = 0;
for (let i: i32 = 0; i < 100000; i++) total += Callbacks.fire(i);
Callbacks.clear();
console.log(total);
