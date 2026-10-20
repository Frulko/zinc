// zinc debug (ZN-371.01): stopped at a breakpoint, stepped over, into and out by tests/t1/debug_cli.sh.
class Point {
  x: number;
  y: number;
  constructor(x: number, y: number) { this.x = x; this.y = y; }
}

function add(a: number, b: number): number {
  const sum = a + b;
  return sum;
}

function run(): void {
  let total = 0;
  const p = new Point(1, 2);
  const name = 'zinc';
  const list = [1, 2, 3];
  for (const v of list) {
    total = add(total, v);
  }
  console.log(name, total, p.x);
}

run();
console.log('done');
