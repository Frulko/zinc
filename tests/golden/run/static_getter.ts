// Static accessors (ZN-155): `static get v()` read as A.v, a call of the accessor.
class A {
  static n = 2;
  static get v(): number { return A.n * 10; }
  static get label(): string { return 'n=' + A.n; }
}
console.log(A.v, A.label);
A.n = 3;
console.log(A.v + 1, A.label);
