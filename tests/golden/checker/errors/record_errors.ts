interface Point { x: number; y: number; }
interface Mixed { x: number; f(): number; }  // valid: a property and a method
class C { constructor(public x: number, public y: number) {} }
const a: Point = { x: 1 };
const b: Point = { x: 1, y: 2, z: 3 };
const c: Point = { x: 1, y: 'two' };
const d: Point = new C(1, 2);
const e = new Point();
const f = { x: 1, x: 2 };
const g = { n: null };
class D extends Point {}
console.log(a instanceof Point);
