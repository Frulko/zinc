class Receiver { apply(f: (n: number) => number): number { return f(4); } }
const method = new Receiver().apply;
console.log(method(n => n * 2));
