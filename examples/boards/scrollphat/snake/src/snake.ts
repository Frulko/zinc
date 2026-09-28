// Snake on a small grid with a simple autopilot: breadth-first search to the food, and when that path is missing or
// would trap the snake, the move that keeps the most free space around the head (flood fill).

const DX: i32[] = [1, 0, -1, 0];
const DY: i32[] = [0, 1, 0, -1];

export class Snake {
  readonly cols: i32;
  readonly rows: i32;
  /** Body cells as indices (y * cols + x), head first. */
  body: i32[] = [];
  food: i32 = 0;
  alive: boolean = true;
  private occupied: boolean[] = [];

  constructor(cols: i32, rows: i32) {
    this.cols = cols;
    this.rows = rows;
    for (let i: i32 = 0; i < cols * rows; i++) this.occupied.push(false);
    this.reset();
  }

  reset(): void {
    for (let i: i32 = 0; i < this.occupied.length; i++) this.occupied[i] = false;
    const y = Math.floor(this.rows / 2);
    this.body = [y * this.cols + 2, y * this.cols + 1, y * this.cols];
    for (const c of this.body) this.occupied[c] = true;
    this.alive = true;
    this.placeFood();
  }

  private placeFood(): void {
    const free: i32[] = [];
    for (let i: i32 = 0; i < this.occupied.length; i++) if (!this.occupied[i]) free.push(i);
    this.food = free.length > 0 ? free[Math.floor(Math.random() * free.length)] : -1;
  }

  /** Neighbour of cell c in direction d, -1 outside the grid. */
  private step(c: i32, d: i32): i32 {
    const x = c % this.cols + DX[d], y = Math.floor(c / this.cols) + DY[d];
    return x < 0 || y < 0 || x >= this.cols || y >= this.rows ? -1 : y * this.cols + x;
  }

  /** Can the head enter cell n? The tail cell is fine: it moves away in the same step. */
  private open(n: i32): boolean { return n >= 0 && (!this.occupied[n] || n === this.body[this.body.length - 1]); }

  /** First direction of a shortest path from the head to the food, -1 when there is none. */
  private pathToFood(): i32 {
    const n = this.cols * this.rows;
    const firstDir: i32[] = [];
    for (let i: i32 = 0; i < n; i++) firstDir.push(-2);
    const queue: i32[] = [];
    const head = this.body[0];
    for (let d: i32 = 0; d < 4; d++) {
      const c = this.step(head, d);
      if (c >= 0 && this.open(c) && firstDir[c] === -2) { firstDir[c] = d; queue.push(c); }
    }
    for (let q: i32 = 0; q < queue.length; q++) {
      const c = queue[q];
      if (c === this.food) return firstDir[c];
      for (let d: i32 = 0; d < 4; d++) {
        const m = this.step(c, d);
        if (m >= 0 && !this.occupied[m] && firstDir[m] === -2) { firstDir[m] = firstDir[c]; queue.push(m); }
      }
    }
    return -1;
  }

  /** Free cells reachable from c (c included). */
  private space(c: i32): i32 {
    const seen: boolean[] = [];
    for (let i: i32 = 0; i < this.occupied.length; i++) seen.push(this.occupied[i]);
    seen[c] = true;
    const stack: i32[] = [c];
    let count: i32 = 0;
    while (stack.length > 0) {
      const x = stack.pop()!;
      count++;
      for (let d: i32 = 0; d < 4; d++) {
        const m = this.step(x, d);
        if (m >= 0 && !seen[m]) { seen[m] = true; stack.push(m); }
      }
    }
    return count;
  }

  /** The autopilot's move. */
  private choose(): i32 {
    const toFood = this.pathToFood();
    if (toFood >= 0 && this.space(this.step(this.body[0], toFood)) >= this.body.length) return toFood;
    let best: i32 = -1, bestSpace: i32 = -1;
    for (let d: i32 = 0; d < 4; d++) {
      const c = this.step(this.body[0], d);
      if (c < 0 || !this.open(c)) continue;
      const s = this.space(c);
      if (s > bestSpace) { best = d; bestSpace = s; }
    }
    return best >= 0 ? best : toFood;
  }

  /** Advances one cell. Returns true when the snake ate. */
  tick(): boolean {
    if (!this.alive) return false;
    const d = this.choose();
    const next = d >= 0 ? this.step(this.body[0], d) : -1;
    if (next < 0 || !this.open(next)) { this.alive = false; return false; }
    const ate = next === this.food;
    if (!ate) this.occupied[this.body.pop()!] = false;
    this.body.unshift(next);
    this.occupied[next] = true;
    if (ate) {
      this.placeFood();
      if (this.food < 0) this.alive = false;  // the board is full: a perfect game, start again
    }
    return ate;
  }
}
