// TypeScript 4.6: statements that do not use `this` may come before super(...) in a derived class constructor
class Base {
  label: string;
  constructor(label: string) { this.label = label; }
}
class Child extends Base {
  size: i32;
  constructor(text: string) {
    const parts = text.split(',');
    const n: i32 = parts.length;
    super(`${parts[0]}+${n}`);
    this.size = n;
  }
}
const c = new Child('a,b,c');
console.log(`${c.label} ${c.size}`);
