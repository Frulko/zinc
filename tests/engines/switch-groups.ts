enum Direction { Left, Right, Up, Down }
function axis(direction: Direction): string {
  switch (direction) {
    case Direction.Left:
    case Direction.Right: return 'horizontal';
    case Direction.Up:
    case Direction.Down: return 'vertical';
    default: return 'unknown';
  }
}
console.log(axis(Direction.Left), axis(Direction.Right), axis(Direction.Up), axis(Direction.Down));
function grouped(n: i32): i32 {
  let result: i32 = 0;
  switch (n) {
    case 0:
    case 1: result = 7; break;
    case 2:
    default: result = 9;
  }
  return result;
}
console.log(grouped(0), grouped(1), grouped(2), grouped(3));
