// zinc profile names a closure by where it is: `Class.method/<anonymous>`, `outer/inner` (tests/t0/profile_names.sh).
class Mixer {
  total: number = 0;
  run(n: number): number {
    const xs: number[] = Array.from({ length: n }, (_, i): number => i);
    return xs.map((x: number): number => x * 2).reduce((a: number, b: number): number => a + b, 0);
  }
}
function outer(n: number): number {
  const inner = (k: number): number => {
    let s = 0;
    for (let i = 0; i < k; i++) s += i % 7;
    return s;
  };
  let t = 0;
  for (let r = 0; r < 300; r++) t += inner(n);
  return t;
}
const m = new Mixer();
let sum = 0;
for (let r = 0; r < 300; r++) sum += m.run(3000);
console.log(sum + ' ' + outer(3000));
