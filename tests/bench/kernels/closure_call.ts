const add = (a: i32, b: i32): i32 => a + b;
let s = 0;
for (let i = 0; i < 20000000; i++) s = add(s, 1);
console.log(s);
