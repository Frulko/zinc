// Rendering supplies seconds per frame; physics consumes whole fixed steps and keeps the remainder.
export class FixedClock {
  private remaining: number = 0;
  advance(delta: number, step: number): i32 {
    this.remaining = Math.min(this.remaining + Math.max(0, delta), 0.1);
    const count: i32 = Math.floor((this.remaining + step * 0.000001) / step);
    this.remaining = Math.max(0, this.remaining - count * step);
    return count;
  }
  alpha(step: number): number { return this.remaining / step; }
  reset(): void { this.remaining = 0; }
}

export function interpolate(previous: number, current: number, alpha: number): number {
  return previous + (current - previous) * alpha;
}
