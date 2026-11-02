// Wave Function Collapse, the simple tiled model, written from the published description (Gumin 2016, after Merrell's model synthesis): every cell holds a set of
// tiles still possible (a bitmask, at most 30 tiles), adjacency rules prune the neighbours (propagation with a stack), and the cell with the fewest tiles left is
// collapsed to one of them, drawn by weight. No game types in here, and no sin or float-order tricks: only the integer hash, so a seed gives the same grid on every engine.
//
// What makes it fit a large grid: it works in chunks (solveChunk). A chunk reads the cells of the chunks already solved around it as fixed borders and touches
// nothing outside itself, so a 1024 x 1024 map is solved slice by slice, each slice a few milliseconds. A contradiction (a cell left with no tile) is repaired locally:
// the cells around it go back to their starting sets, with a growing radius, then the chunk is redrawn with another salt, and only as a last resort one cell takes a tile
// against the rules (`forced`, counted: a rule set whose sets always keep a glue tile such as `EDGE` of gen/cover.ts never gets there).
import { hash } from '../world/noise';

/** adj[d][a] is the bitmask of the tiles allowed on the neighbour of a tile a in direction d (0: +x, 1: -x, 2: +y, 3: -y). */
export class WfcRules { count: number = 0; adj: number[][] = [[], [], [], []]; }
/** The same rule in every direction from a symmetric table: pairs[a] lists the tiles that may stand beside a. */
export function symmetricRules(count: number, pairs: number[][]): WfcRules {
  const r = new WfcRules();
  r.count = count;
  for (let d = 0; d < 4; d++) for (let a = 0; a < count; a++) { let m = 0; for (const b of pairs[a]) m |= 1 << b; r.adj[d].push(m); }
  return r;
}
function bits(m: number): number { let n = 0; while (m !== 0) { m &= m - 1; n++; } return n; }
function lowest(m: number): number { let k = 0; while ((m & 1) === 0) { m >>>= 1; k++; } return k; }

export class Wfc {
  w: number; h: number; rules: WfcRules; seed: number;
  init: number[];                       // the starting set of each cell; 0 means the cell is not part of the problem (it neither constrains nor is drawn)
  dom: number[];                        // the working sets: the answer is one bit per cell once solved
  solved: number[];                     // 1 in the cells of the chunks solved so far
  weight: (t: number, tile: number) => number;
  restarts: number = 0; forced: number = 0;
  private salt: number = 0;
  private buckets: number[][] = [];
  constructor(w: number, h: number, rules: WfcRules, init: number[], weight: (t: number, tile: number) => number, seed: number) {
    this.w = w; this.h = h; this.rules = rules; this.init = init; this.weight = weight; this.seed = seed;
    this.dom = init.slice(); this.solved = Array.from({ length: w * h }, (): number => 0);
    for (let k = 0; k <= rules.count; k++) this.buckets.push([]);
  }
  /** The tile of a solved cell, -1 for a cell outside the problem. */
  tile(t: number): number { return this.init[t] === 0 || bits(this.dom[t]) !== 1 ? -1 : lowest(this.dom[t]); }

  /** Solves the whole grid in chunks of `size` x `size` cells, row after row. */
  solveAll(size: number = 64): void {
    for (let j = 0; j < this.h; j += size) for (let i = 0; i < this.w; i += size) this.solveChunk(i, j, Math.min(this.w, i + size), Math.min(this.h, j + size));
  }

  /** Solves the cells i0 <= i < i1, j0 <= j < j1, given the chunks solved before (their cells stay as they are). */
  solveChunk(i0: number, j0: number, i1: number, j1: number): void {
    const w = this.w, order: number[] = [];
    for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) { const t = j * w + i; this.dom[t] = this.init[t]; if (this.init[t] !== 0) order.push(t); }
    const keys: number[] = order.map((t: number): number => hash(t + this.seed * 31, 5171));
    const idx: number[] = order.map((_t: number, k: number): number => k);
    idx.sort((a: number, b: number): number => keys[a] - keys[b]);
    const shuffled: number[] = idx.map((k: number): number => order[k]);
    this.salt = 0;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) { this.restarts += 1; this.salt = attempt; for (const t of order) this.dom[t] = this.init[t]; }
      if (this.run(shuffled, i0, j0, i1, j1)) break;
      if (attempt === 3) this.force(order);
    }
    for (const t of order) this.solved[t] = 1;
  }

  /** The solved cells touching the chunk: they send their constraint in. */
  private borders(i0: number, j0: number, i1: number, j1: number): number[] {
    const w = this.w, h = this.h, stack: number[] = [];
    for (let j = j0 - 1; j <= j1; j++) for (let i = i0 - 1; i <= i1; i++) {                                // the solved cells touching the chunk send their constraint in
      if (i >= i0 && i < i1 && j >= j0 && j < j1) continue;
      if (i < 0 || j < 0 || i >= w || j >= h) continue;
      const t = j * w + i;
      if (this.solved[t] === 1 && this.init[t] !== 0) stack.push(t);
    }
    return stack;
  }

  /** Border constraints, then collapse until every cell of the chunk has one tile. False when a contradiction could not be repaired locally. */
  private run(order: number[], i0: number, j0: number, i1: number, j1: number): boolean {
    const stack = this.borders(i0, j0, i1, j1);
    if (this.propagate(stack, i0, j0, i1, j1) >= 0) return false;
    this.fill(order);
    let radius = 2, guard = 0;
    while (guard++ < 100000) {
      const t = this.next();
      if (t < 0) return true;
      this.dom[t] = 1 << this.pick(t);
      const one: number[] = [t];
      const bad = this.propagate(one, i0, j0, i1, j1);
      if (bad < 0) { this.refill(); continue; }
      this.restarts += 1;                                                                                 // local repair: reset a window around the contradiction, wider each time
      let fixed = false;
      for (let tryNo = 0; tryNo < 5 && !fixed; tryNo++) { fixed = this.repair(bad, radius, i0, j0, i1, j1); radius *= 2; }
      if (!fixed) return false;
      radius = 2;
      this.fill(order);
    }
    return false;
  }

  /** The next cell to collapse: the one with the fewest tiles left (the last pushed of the lowest bucket), -1 when none is undecided. */
  private next(): number {
    for (let k = 2; k <= this.rules.count; k++) {
      const b = this.buckets[k];
      while (b.length > 0) { const c = b.pop() as number; if (this.init[c] !== 0 && bits(this.dom[c]) === k) return c; }
    }
    return -1;
  }

  /** Puts every undecided cell in the bucket of its set size (in the shuffled order, so ties are broken by the hash). */
  private fill(order: number[]): void {
    for (let k = 0; k <= this.rules.count; k++) this.buckets[k] = [];
    for (let n = order.length - 1; n >= 0; n--) { const t = order[n], c = bits(this.dom[t]); if (c >= 2) this.buckets[c].push(t); }
  }
  /** After a collapse the cells whose set shrank go to their new bucket (stale entries are skipped when popped). */
  private refill(): void {
    for (const u of this.changed) { const c = bits(this.dom[u]); if (c >= 2) this.buckets[c].push(u); }
  }
  private changed: number[] = [];

  /** Weighted draw of a tile of the set of cell t. */
  private pick(t: number): number {
    const m = this.dom[t];
    let total = 0;
    for (let k = 0; k < this.rules.count; k++) if ((m & (1 << k)) !== 0) total += Math.max(.001, this.weight(t, k));
    let r = hash(t * 7 + this.salt * 7919, this.seed + 8863) * total, last = 0;
    for (let k = 0; k < this.rules.count; k++) {
      if ((m & (1 << k)) === 0) continue;
      last = k; r -= Math.max(.001, this.weight(t, k));
      if (r < 0) return k;
    }
    return last;
  }

  /** Prunes neighbours from the cells on the stack, inside the chunk only. Returns the cell left with nothing, or -1. */
  private propagate(stack: number[], i0: number, j0: number, i1: number, j1: number): number {
    this.changed = [];
    const w = this.w, h = this.h, adj = this.rules.adj;
    while (stack.length > 0) {
      const c = stack.pop() as number;
      if (this.init[c] === 0) continue;
      const ci = c % w, cj = Math.floor(c / w), m = this.dom[c];
      for (let d = 0; d < 4; d++) {
        const i = ci + (d === 0 ? 1 : d === 1 ? -1 : 0), j = cj + (d === 2 ? 1 : d === 3 ? -1 : 0);
        if (i < i0 || j < j0 || i >= i1 || j >= j1 || i >= w || j >= h) continue;
        const n = j * w + i;
        if (this.init[n] === 0) continue;
        let allowed = 0;
        for (let mm = m; mm !== 0; mm &= mm - 1) allowed |= adj[d][lowest(mm)];
        const nd = this.dom[n] & allowed;
        if (nd === this.dom[n]) continue;
        if (nd === 0) return n;
        this.dom[n] = nd;
        stack.push(n); this.changed.push(n);
      }
    }
    return -1;
  }

  /** Resets the cells within `radius` of `bad` (inside the chunk) and lets the cells around them constrain them again. */
  private repair(bad: number, radius: number, i0: number, j0: number, i1: number, j1: number): boolean {
    const w = this.w, h = this.h, bi = bad % w, bj = Math.floor(bad / w), stack: number[] = [];
    this.salt += 1;
    for (let j = Math.max(j0, bj - radius); j <= Math.min(j1 - 1, bj + radius); j++) for (let i = Math.max(i0, bi - radius); i <= Math.min(i1 - 1, bi + radius); i++) this.dom[j * w + i] = this.init[j * w + i];
    for (let j = bj - radius - 1; j <= bj + radius + 1; j++) for (let i = bi - radius - 1; i <= bi + radius + 1; i++) {
      if (i < 0 || j < 0 || i >= w || j >= h) continue;
      if (i >= bi - radius && i <= bi + radius && j >= bj - radius && j <= bj + radius && i >= i0 && i < i1 && j >= j0 && j < j1) continue;   // inside the reset window
      const t = j * w + i;
      if (this.init[t] !== 0 && (this.solved[t] === 1 || (i >= i0 && i < i1 && j >= j0 && j < j1))) stack.push(t);
    }
    return this.propagate(stack, i0, j0, i1, j1) < 0;
  }

  /** The last resort: a cell without a tile takes the first of its starting set, and the rule break is counted. */
  private force(order: number[]): void {
    for (const t of order) if (bits(this.dom[t]) !== 1) { this.dom[t] = 1 << lowest(this.init[t]); this.forced += 1; }
  }
}

/** Pairs of adjacent solved cells whose tiles the rules forbid (0 for a valid answer). A cell outside the problem has no rule. */
export function wfcViolations(wfc: Wfc): number {
  let n = 0;
  const w = wfc.w, h = wfc.h;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const t = j * w + i, a = wfc.tile(t);
    if (wfc.init[t] === 0) continue;
    if (a < 0) { n++; continue; }
    if (i + 1 < w && wfc.init[t + 1] !== 0 && (wfc.rules.adj[0][a] & (1 << wfc.tile(t + 1))) === 0) n++;
    if (j + 1 < h && wfc.init[t + w] !== 0 && (wfc.rules.adj[2][a] & (1 << wfc.tile(t + w))) === 0) n++;
  }
  return n;
}
