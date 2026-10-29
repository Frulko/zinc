// A lambda that captures variables and is adapted to the type expected (a comparator returning i32 where sort wants a number) keeps its captures
function f(from: i32, to: i32): string {
  const xs: i32[] = [3, 1, 2];
  xs.sort((a: i32, b: i32): i32 => from <= to ? a - b : b - a);
  return xs.join(' ');
}
function g(from: i32, to: i32): string {
  const xs: i32[] = [3, 1, 2];
  xs.sort((a: i32, b: i32) => from <= to ? a - b : b - a);
  return xs.join(' ');
}
function k(up: boolean): string {
  const xs: i32[] = [3, 1, 2];
  xs.sort((a: i32, b: i32): i32 => up ? a - b : b - a);
  return xs.join(' ');
}
console.log(k(true), k(false));
console.log(g(1, 2), g(2, 1));
console.log(f(1, 2), f(2, 1));
