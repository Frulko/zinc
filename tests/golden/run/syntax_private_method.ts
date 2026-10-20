class C { #x: number = 1; #inc(): void { this.#x++ } get v(): number { return this.#x } run(): void { this.#inc() } }
const c = new C(); c.run(); console.log(c.v)
