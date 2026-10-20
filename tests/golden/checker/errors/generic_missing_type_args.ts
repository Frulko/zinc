class Box<T> { v: T; constructor(v: T) { this.v = v; } }
const b: Box = new Box<i32>(1);
