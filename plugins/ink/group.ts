// StrokeGrouper (ZN-932): which pen strokes belong to one mark. A person writes a letter in one to three strokes, with a circle around it
// or a second stroke of an X; the grouper collects them and says when the mark is finished (docs/reports/murdoku-eink-handwriting.md s3).
// A stroke joins the open group when its bounding box, inflated by `gapPx`, touches the group's; one that is elsewhere closes the open group
// at once and starts a new one; a group with no new stroke for `debounceMs` is finished by poll().
import { Stroke } from './index';

export interface GrouperOptions {
  /** Pen-up time after which a group is finished (default 900 ms: a person takes that long between the strokes of an A or an X). */
  debounceMs?: number;
  /** How far apart (px) two strokes may be and still be one mark: the cell size times 0.2 for a board (default 40). */
  gapPx?: number;
}

export class StrokeGrouper {
  debounceMs: number;
  gapPx: number;
  open: Stroke[] = [];
  last: number = 0;
  done: Stroke[][] = [];
  x0: number = 0; y0: number = 0; x1: number = 0; y1: number = 0;

  constructor(opts: GrouperOptions = {}) {
    this.debounceMs = opts.debounceMs !== undefined ? opts.debounceMs : 900;
    this.gapPx = opts.gapPx !== undefined ? opts.gapPx : 40;
  }

  /** A finished stroke (pen up) at time `now` (ms, any clock, the same as poll's). */
  add(s: Stroke, now: number): void {
    if (s.count() === 0) return;
    if (this.open.length > 0) {
      const g = this.gapPx;
      if (s.x0 - g > this.x1 || s.x1 + g < this.x0 || s.y0 - g > this.y1 || s.y1 + g < this.y0) this.close();
    }
    if (this.open.length === 0) { this.x0 = s.x0; this.y0 = s.y0; this.x1 = s.x1; this.y1 = s.y1; }
    else { this.x0 = Math.min(this.x0, s.x0); this.y0 = Math.min(this.y0, s.y0); this.x1 = Math.max(this.x1, s.x1); this.y1 = Math.max(this.y1, s.y1); }
    this.open.push(s);
    this.last = now;
  }

  private close(): void {
    if (this.open.length > 0) { this.done.push(this.open); this.open = []; }
  }

  /** The groups finished by now (null when there are none), oldest first. Call it once per frame. */
  poll(now: number): Stroke[][] | null {
    if (this.open.length > 0 && now - this.last >= this.debounceMs) this.close();
    if (this.done.length === 0) return null;
    const out = this.done;
    this.done = [];
    return out;
  }

  /** Finishes the open group now (a button was pressed, a page turned). */
  flush(): void { this.close(); }
}
