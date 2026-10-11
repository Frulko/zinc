function scaled(k: number): number {
  const o = { n: 1, get v(): number { return this.n * k; } };
  return o.v;
}
console.log(scaled(3));
