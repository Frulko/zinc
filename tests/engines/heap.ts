interface Point { x: i32; y: i32; }
interface Reverse { y: i32; x: i32; }
function point(n: i32): Point { return { x: n, y: n + 1 }; }
function read(p: Point): i32 { return p.x + p.y; }
const p: Point = point(4);
const alias: Point = p;
alias.x = 9;
const reverse: Reverse = { y: 10, x: 20 };
console.log(p.x, read(p), reverse.x + reverse.y);
const points: Point[] = [p, point(7)];
points[1].y = 12;
console.log(points.length, points[1].x, points[1].y);
const numbers: i32[] = [1, 2, 3];
const same: i32[] = numbers;
same[0] = 8;
numbers.push(4);
numbers[numbers.length] = 5;
let sum: i32 = 0;
for (const n of numbers) sum += n;
console.log(sum, numbers.pop(), same.length, numbers[0]);
function returning(): i32[] { return [11, 12]; }
console.log(returning()[1]);
interface Link { value: i32; next: Link | null; }
function cycles(n: i32): i32 {
  let result: i32 = 0;
  for (let i: i32 = 0; i < n; i++) {
    const a: Link = { value: i, next: null };
    const b: Link = { value: i + 1, next: a };
    a.next = b;
    result = a.next.value;
    const text: string = `iteration:${i}`;
    if (i === n - 1) console.log(text);
  }
  return result;
}
console.log(cycles(20000));

function survivesCollection(): i32 {
  const local: Point = point(80);
  cycles(20000);
  return local.x + local.y;
}
console.log(survivesCollection());

let cursor: i32 = 0;
function nextIndex(): i32 { return cursor++; }
const updates: i32[] = [10, 20];
updates[nextIndex()] += 1;
console.log(cursor, updates[0], updates[1]);
