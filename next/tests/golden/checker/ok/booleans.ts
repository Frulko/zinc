const a: i32 = 4;
const small: boolean = a < 5 && a > 0;
const either: boolean = a === 1 || a === 4;
const flip: boolean = !small;
const pick: string = small ? "small" : "big";
let flag: boolean = false;
flag = flag || either;
console.log(small, either, flip, pick, flag);
