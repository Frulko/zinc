// The table as the visitor standing at one of its sides sees it. Texts, buttons and panels are laid out and drawn in this frame: x to the
// visitor's right, y toward the visitor, the same units as the table. At the main side the frame is the table; at the three others it is the
// table turned, and at the short sides it is higher than wide. Photo cards are not in it: they lie on the table and stay free.
import { setTransform, resetTransform } from 'zinc:gfx';

export class Frame {
  /** The side the visitor stands at: 0 the main side (the bottom of the screen), 1 the right, 2 the far side, 3 the left. */
  side: i32 = 0;
  /** While the frame is `on`: what to add to the pixels drawn in it. */
  ox = 0;
  oy = 0;
  private W: number;
  private H: number;
  constructor(tableWidth: number, tableHeight: number) { this.W = tableWidth; this.H = tableHeight; }

  /** The size of the frame. */
  get w(): number { return this.side % 2 === 0 ? this.W : this.H; }
  get h(): number { return this.side % 2 === 0 ? this.H : this.W; }

  /** A point of the table, in the frame. */
  x(tx: number, ty: number): number { return this.side === 0 ? tx : this.side === 1 ? this.H - ty : this.side === 2 ? this.W - tx : ty; }
  y(tx: number, ty: number): number { return this.side === 0 ? ty : this.side === 1 ? tx : this.side === 2 ? this.H - ty : this.W - tx; }

  /** A point of the frame, on the table. */
  tableX(fx: number, fy: number): number { return this.side === 0 ? fx : this.side === 1 ? fy : this.side === 2 ? this.W - fx : this.W - fy; }
  tableY(fx: number, fy: number): number { return this.side === 0 ? fy : this.side === 1 ? this.H - fx : this.side === 2 ? this.H - fy : fx; }

  /** A move on the table, in the frame; and a move in the frame, on the table. */
  dx(tx: number, ty: number): number { return this.side === 0 ? tx : this.side === 1 ? -ty : this.side === 2 ? -tx : ty; }
  dy(tx: number, ty: number): number { return this.side === 0 ? ty : this.side === 1 ? tx : this.side === 2 ? -ty : -tx; }
  tableDx(fx: number, fy: number): number { return this.side === 0 ? fx : this.side === 1 ? fy : this.side === 2 ? -fx : -fy; }
  tableDy(fx: number, fy: number): number { return this.side === 0 ? fy : this.side === 1 ? -fx : this.side === 2 ? -fy : fx; }
  /** The side as the story log names it. */
  get name(): string { return this.side === 0 ? 'bottom' : this.side === 1 ? 'right' : this.side === 2 ? 'top' : 'left'; }

  /** The side whose edge is the nearest to a point of the table: where a hand that touches there comes from. */
  nearest(tx: number, ty: number): i32 {
    const d: number[] = [this.H - ty, this.W - tx, ty, tx];
    let best: i32 = 0;
    for (let s: i32 = 1; s < 4; s++) if (d[s] < d[best]) best = s;
    return best;
  }

  /** What is drawn from now on is in the frame: frame units times `k`, plus (this.ox, this.oy). The table's origin is at (ox, oy) on the
   *  screen. At the main side nothing is transformed, so its texts keep the fast path of the renderer. */
  on(ox: number, oy: number, k: number): void {
    this.ox = 0; this.oy = 0;
    if (this.side === 0) { resetTransform(); this.ox = ox; this.oy = oy; }
    else if (this.side === 1) setTransform(0, -1, 1, 0, ox, oy + this.H * k);
    else if (this.side === 2) setTransform(-1, 0, 0, -1, ox + this.W * k, oy + this.H * k);
    else setTransform(0, 1, -1, 0, ox + this.W * k, oy);
  }
  off(): void { resetTransform(); }
}
