// The board: a grid of settled cubes plus the cubes still falling. Cubes fall with gravity, slide off taller
// stacks like sand, full rows flash then clear (Tetris-like), and an overflowing column ends the round.

const PALETTE: u32[] = [0xff2a2a, 0xff9a00, 0xffe600, 0x2aff4a, 0x00c8ff, 0x3a5aff, 0xc03aff];
const GRAVITY = 40;           // cells per second squared
const FLASH_SECONDS = 0.35;   // how long a full row blinks before it clears

export class Cube {
  y = -1;       // fractional row, starts above the board
  speed = 0;    // rows per second

  constructor(public x: i32, public color: u32) {}
}

export class Board {
  readonly cols: i32;
  readonly rows: i32;
  falling: Cube[] = [];
  flashRow: i32 = -1;         // the full row that is blinking, or -1
  flashTime = 0;
  overflowed = false;         // a column is full: the round is over
  private cells: u32[] = [];  // settled cubes, row-major, 0 = empty

  constructor(cols: i32, rows: i32) {
    this.cols = cols;
    this.rows = rows;
    for (let i: i32 = 0; i < cols * rows; i++) this.cells.push(0);
  }

  at(x: i32, y: i32): u32 {
    return this.cells[y * this.cols + x];
  }

  /** Lowest free row of a column (-1 when the column is full). */
  surface(x: i32): i32 {
    let y: i32 = this.rows - 1;
    while (y >= 0 && this.at(x, y) !== 0) y--;
    return y;
  }

  /** Drops a cube of a random colour into a random column. */
  spawn(): void {
    const x: i32 = Math.floor(Math.random() * this.cols);
    if (this.surface(x) < 0) {
      this.overflowed = true;
      return;
    }
    this.falling.push(new Cube(x, PALETTE[Math.floor(Math.random() * PALETTE.length)]));
  }

  /** Moves the falling cubes and the row flash forward by `dt` seconds. */
  update(dt: number): void {
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const cube = this.falling[i];
      cube.speed += GRAVITY * dt;
      cube.y += cube.speed * dt;
      if (cube.y >= this.surface(cube.x)) {
        this.falling.splice(i, 1);
        this.land(cube);
      }
    }
    if (this.flashRow >= 0) {
      this.flashTime -= dt;
      if (this.flashTime <= 0) {
        this.clearRow(this.flashRow);
        this.flashRow = -1;
      }
    }
  }

  reset(): void {
    for (let i: i32 = 0; i < this.cells.length; i++) this.cells[i] = 0;
    this.falling.splice(0, this.falling.length);
    this.flashRow = -1;
    this.overflowed = false;
  }

  /** Settles a landed cube: it slides towards a lower neighbour column (sand), then joins the grid. */
  private land(cube: Cube): void {
    const x = this.slide(cube.x);
    const y = this.surface(x);
    if (y < 0) {
      this.overflowed = true;
      return;
    }
    this.cells[y * this.cols + x] = cube.color;
    if (this.flashRow < 0 && this.isRowFull(y)) {
      this.flashRow = y;
      this.flashTime = FLASH_SECONDS;
    }
  }

  /** Column where a cube dropped on `x` comes to rest; ties between both sides are broken at random. */
  private slide(start: i32): i32 {
    let x = start;
    for (let step: i32 = 0; step < this.cols; step++) {
      const here = this.surface(x);
      const left: i32 = x > 0 ? this.surface(x - 1) : -1;
      const right: i32 = x < this.cols - 1 ? this.surface(x + 1) : -1;
      if (left > here + 1 && (right <= here + 1 || Math.random() < 0.5)) x--;
      else if (right > here + 1) x++;
      else break;
    }
    return x;
  }

  private isRowFull(y: i32): boolean {
    for (let x: i32 = 0; x < this.cols; x++) if (this.at(x, y) === 0) return false;
    return true;
  }

  /** Removes a row; everything above moves down one row. */
  private clearRow(row: i32): void {
    for (let y = row; y > 0; y--) {
      for (let x: i32 = 0; x < this.cols; x++) this.cells[y * this.cols + x] = this.cells[(y - 1) * this.cols + x];
    }
    for (let x: i32 = 0; x < this.cols; x++) this.cells[x] = 0;
  }
}
