// Enums and switch: numeric enums with explicit values, fall-through cases and a default.
import { section } from '../report';

enum Dir { Up, Down, Left = 10, Right }

function describe(dir: Dir): string {
  switch (dir) {
    case Dir.Up: return 'up';
    case Dir.Left:
    case Dir.Right: return 'side';
    default: return 'down';
  }
}

export function enums(): void {
  section('Enums');
  const all = [Dir.Up, Dir.Down, Dir.Left, Dir.Right];
  console.log(all.map(describe).join(','), Dir.Right);   // Right follows Left = 10
}
