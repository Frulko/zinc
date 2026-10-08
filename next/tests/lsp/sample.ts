class Point {
  x: number;
  y: number;
  constructor(x: number, y: number) { this.x = x; this.y = y; }
  length(): number { return Math.sqrt(this.x * this.x + this.y * this.y); }
}

function twice(n: number): number {
  return n * 2;
}

const origin = new Point(3, 4);
const total = twice(origin.length());
console.log(total);
