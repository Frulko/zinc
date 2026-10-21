// A static block is checked once the class exists: an unknown static it assigns is an error, not a crash of the lowering (fuzz, v0.4.3)
class C {
  static n: number = 0;
  static { C.m = 5; }
}
console.log(C.n);
