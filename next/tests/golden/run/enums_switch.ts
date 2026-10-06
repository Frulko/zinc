// Accessors, numeric enums and switch: fall-through, default in the middle, break, strings, continue inside a loop.
enum Dir { Up, Down, Left = 10, Right }
enum Level { Low = -1, Mid = 5, High }

function describe(dir: Dir): string {
  switch (dir) {
    case Dir.Up: return 'up';
    case Dir.Left:
    case Dir.Right: return 'side';
    default: return 'down';
  }
}

function weird(n: i32): string {
  let out = '';
  switch (n) {
    case 1: out += 'one ';
    default: out += 'dflt ';
    case 2: out += 'two '; break;
    case 3: { out += 'three '; }
  }
  return out + '|';
}

function word(s: string): i32 {
  switch (s) {
    case 'a': return 1;
    case 'bb': return 2;
  }
  return 0;
}

class Rect {
  constructor(public w: i32, public h: i32) {}
  get area(): i32 { return this.w * this.h; }
  get isSquare(): boolean { return this.w === this.h; }
}
class Sq extends Rect {
  constructor(s: i32) { super(s, s); }
  get area(): i32 { return this.w * this.w + 1; }
}

console.log(describe(Dir.Up), describe(Dir.Down), describe(Dir.Left), describe(Dir.Right), Dir.Right, Level.Low, Level.High);
console.log(weird(1), weird(2), weird(3), weird(4));
console.log(word('a'), word('bb'), word('c'));
const r = new Rect(3, 4);
const shapes: Rect[] = [r, new Sq(5)];
console.log(r.area, r.isSquare, shapes[1].area, shapes[1].isSquare);
let total = 0;
for (let i = 0; i < 6; i++) {
  switch (i % 3) {
    case 0: continue;
    case 1: total += 10; break;
    default: total += 1;
  }
  total += 100;
}
console.log(total);
const d: Dir = Dir.Left;
console.log(d === Dir.Left, d + 1, Level.Mid + 0);
