// A tiny falling-sand simulation on a grid: every grain tries to move one cell "downhill" (the direction of the
// tilt), sliding diagonally around obstacles, like sand in a tilted box.

export class Sand {
  readonly cols: i32;
  readonly rows: i32;
  /** Colour of the grain in each cell (row-major), 0 = empty. */
  readonly cells: u32[] = [];
  private moved: boolean[] = [];

  constructor(cols: i32, rows: i32) {
    this.cols = cols;
    this.rows = rows;
    for (let i: i32 = 0; i < cols * rows; i++) { this.cells.push(0); this.moved.push(false); }
  }

  at(x: i32, y: i32): u32 { return this.cells[y * this.cols + x]; }

  private free(x: i32, y: i32): boolean {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows && this.cells[y * this.cols + x] === 0;
  }

  private move(x: i32, y: i32, nx: i32, ny: i32): void {
    const to = ny * this.cols + nx;
    this.cells[to] = this.cells[y * this.cols + x];
    this.cells[y * this.cols + x] = 0;
    this.moved[to] = true;
  }

  /** Puts a grain in a random empty cell (false when the box is full). */
  drop(color: u32): boolean {
    for (let tries: i32 = 0; tries < 64; tries++) {
      const i: i32 = Math.floor(Math.random() * this.cols * this.rows);
      if (this.cells[i] === 0) { this.cells[i] = color; return true; }
    }
    return false;
  }

  /** Throws every grain to a new random cell (a shake). */
  scatter(): void {
    const grains: u32[] = [];
    for (let i: i32 = 0; i < this.cells.length; i++) if (this.cells[i] !== 0) { grains.push(this.cells[i]); this.cells[i] = 0; }
    for (const g of grains) this.drop(g);
  }

  /** One step with gravity (gx, gy): each component is -1, 0 or 1. Returns how many grains moved. */
  step(gx: i32, gy: i32): i32 {
    if (gx === 0 && gy === 0) return 0;
    for (let i: i32 = 0; i < this.moved.length; i++) this.moved[i] = false;
    let count: i32 = 0;
    // visit the downhill side first, so a grain can fall into the space the one below just left
    for (let j: i32 = 0; j < this.rows; j++) {
      const y: i32 = gy > 0 ? this.rows - 1 - j : j;
      for (let k: i32 = 0; k < this.cols; k++) {
        const x: i32 = gx > 0 ? this.cols - 1 - k : k;
        const i = y * this.cols + x;
        if (this.cells[i] === 0 || this.moved[i]) continue;
        if (this.free(x + gx, y + gy)) { this.move(x, y, x + gx, y + gy); count++; continue; }
        // blocked: slide sideways around the obstacle, left or right of the fall direction at random
        const flip = Math.random() < 0.5;
        let ax: i32 = gx !== 0 && gy !== 0 ? gx : gx - gy, ay: i32 = gx !== 0 && gy !== 0 ? 0 : gy + gx;
        let bx: i32 = gx !== 0 && gy !== 0 ? 0 : gx + gy, by: i32 = gx !== 0 && gy !== 0 ? gy : gy - gx;
        if (flip) { const tx = ax; ax = bx; bx = tx; const ty = ay; ay = by; by = ty; }
        if (this.free(x + ax, y + ay)) { this.move(x, y, x + ax, y + ay); count++; }
        else if (this.free(x + bx, y + by)) { this.move(x, y, x + bx, y + by); count++; }
      }
    }
    return count;
  }
}
