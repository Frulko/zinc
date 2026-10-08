// A rolling window of values: the last `capacity` samples, with their statistics.
export class Series {
  values: number[] = [];
  capacity: i32;
  constructor(capacity: i32) { this.capacity = capacity; }
  push(v: number): void { this.values.push(v); if (this.values.length > this.capacity) this.values.shift(); }
  last(): number { return this.values.length === 0 ? 0 : this.values[this.values.length - 1]; }
  min(): number { let m = Infinity; for (const v of this.values) m = Math.min(m, v); return this.values.length === 0 ? 0 : m; }
  max(): number { let m = -Infinity; for (const v of this.values) m = Math.max(m, v); return this.values.length === 0 ? 0 : m; }
  mean(): number { let s = 0; for (const v of this.values) s += v; return this.values.length === 0 ? 0 : s / this.values.length; }
  /** The change over the window, as a percent of its first value (0 when it starts at 0). */
  trend(): number { if (this.values.length < 2 || this.values[0] === 0) return 0; return (this.last() - this.values[0]) / this.values[0] * 100; }
}
