// Long work on the UI thread, a slice at a time (Genius' model and mixes, For you's shelves, the moods): the work awaits `b.check()`
// between steps, or runs a loop through `b.each()`, which checks after each batch; a check that finds the slice past SLICE_MS lets
// the frames and the input through (a turn of the event loop) before it goes on. A deterministic run reads a clock that stands still
// within a frame: it never pauses, so its frames and results stay what they were. Worker threads would take the work off the thread;
// until then this keeps the page alive.
export const SLICE_MS: number = 8;

/** A turn of the event loop. */
export function tick(): Promise<void> { return new Promise<void>((done: () => void) => { setTimeout(() => { done(); }, 0); }); }

export class Budget {
  private from: number = performance.now();
  /** The longest slice so far, in ms (what the measures print). */
  longest: number = 0;
  /** How long the slice has run, in ms. */
  since(): number { return performance.now() - this.from; }
  /** A turn of the event loop when the slice has run its SLICE_MS, else on at once. */
  async check(): Promise<void> {
    const t = performance.now();
    if (t - this.from < SLICE_MS) return;
    if (t - this.from > this.longest) this.longest = t - this.from;
    await tick();
    this.from = performance.now();
  }
  /** f(0) .. f(n - 1), a check() after each `batch` (one read of the clock per batch, not per item). */
  async each(n: i32, f: (i: i32) => void, batch: i32 = 256): Promise<void> {
    for (let at: i32 = 0; at < n; at += batch) {
      const end = Math.min(n, at + batch) as i32;
      for (let i = at; i < end; i++) f(i);
      await this.check();
    }
  }
}
