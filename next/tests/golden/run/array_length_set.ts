class B { constructor(public v: i32) {} }
const a: i32[] = [1, 2, 3, 4];
a.length = 2;
console.log(a.length, a[1]);
const b: B[] = [new B(1), new B(2), new B(3)];
b.length = 1;
console.log(b.length, b[0].v);
a.length = 0;
console.log(a.length);
