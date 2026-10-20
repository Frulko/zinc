class C { #x = 1; get(): number { return this.#x; } }
const c = new C();
console.log(c.#x);
