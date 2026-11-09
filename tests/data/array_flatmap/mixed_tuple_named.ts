function mapped(n: number): string | [number, number] {
  const pair: [number, number] = [n, n];
  return n === 1 ? 'a' : pair;
}
console.log([1, 2].flatMap(mapped).join(','));
