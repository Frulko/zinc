// What TypeScript refuses stays refused: a member that may itself be null after the chain, and a chain closed by parentheses.
class C { n = 1; }
class B { c: C | null = null; m = new Map<string, number>(); }
class A { b: B | null = null; }
const a = new A();
console.log(`${a.b?.c.n ?? 0}`);
console.log(`${(a.b?.m).size}`);
