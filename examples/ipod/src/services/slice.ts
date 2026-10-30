// Long work a slice at a time (Genius' model and mixes, For you's shelves, the moods): the work awaits `b.check()` between steps, or
// runs a loop through `b.each()`, which checks after each batch; a check that finds the slice past SLICE_MS lets the event loop turn
// before it goes on. The recommendation worker (services/recommend.ts) runs that work off the UI thread: there a turn lets a newer job
// in, and `stop` ends the older one (check() throws STALE). Where the worker runs inline (QuickJS) the turn lets the frames and the
// input through. A deterministic run reads a clock that stands still: it never pauses, so its frames and results stay what they were.
export const SLICE_MS: number = 8;
/** The message of the error check() throws when `stop` says the work was superseded. */
export const STALE = 'superseded';

/** A turn of the event loop. */
export function tick(): Promise<void> { return new Promise<void>((done: () => void) => { setTimeout(() => { done(); }, 0); }); }

export class Budget {
  private from: number = performance.now();
  /** The longest slice so far, in ms (what the measures print). */
  longest: number = 0;
  /** True when the work is no longer wanted (a newer job came during a turn): the check after that turn throws STALE. */
  stop: (() => boolean) | null = null;
  /** How long the slice has run, in ms. */
  since(): number { return performance.now() - this.from; }
  /** A turn of the event loop when the slice has run its SLICE_MS, else on at once. */
  async check(): Promise<void> {
    const t = performance.now();
    if (t - this.from < SLICE_MS) return;
    if (t - this.from > this.longest) this.longest = t - this.from;
    await tick();
    const f = this.stop;
    if (f !== null && f()) throw new Error(STALE);
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
