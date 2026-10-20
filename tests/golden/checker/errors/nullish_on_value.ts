const n: i32 = 1;
const k: i32 = n ?? 2;
class Box { constructor(public v: i32) {} }
const b: Box = new Box(1);
const c: Box = b ?? new Box(2);
