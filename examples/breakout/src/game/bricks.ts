// The brick wall: one row colour per line, more rows (and more points) as the levels go up.
import { width } from 'zinc:gfx';

export class Brick {
  alive = true;

  constructor(public x: number, public y: number, public w: number, public h: number,
              public color: u32, public points: i32) {}
}

const ROW_COLORS: u32[] = [0xff4d4d, 0xff9f43, 0xfeca57, 0x1dd1a1, 0x54a0ff, 0x9b59b6, 0xff6b9d, 0xc8d6e5];
const COLUMNS: i32 = 10;
const BRICK_HEIGHT = 10;
const WALL_TOP = 28;
const SIDE_MARGIN = 10;
const GAP = 2;

/** Level n has 3 + n rows (8 at most); top rows are worth more. */
export function buildWall(level: i32): Brick[] {
  const rows: i32 = Math.min(3 + level, 8);
  const cellWidth = (width() - 2 * SIDE_MARGIN) / COLUMNS;
  const bricks: Brick[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < COLUMNS; col++) {
      const x = SIDE_MARGIN + col * cellWidth + GAP / 2;
      const y = WALL_TOP + row * (BRICK_HEIGHT + GAP);
      bricks.push(new Brick(x, y, cellWidth - GAP, BRICK_HEIGHT, ROW_COLORS[row % ROW_COLORS.length], (rows - row) * 10));
    }
  }
  return bricks;
}
