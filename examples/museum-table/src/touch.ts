// Fingers on the table and what they do to the thing they hold. Each finger belongs to whatever it landed on until it lifts, so several
// hands work on several things at once; a mouse stands in for one finger where there is no touch screen.
import { touchCount, touchX, touchY, touchId, pointerDown, pointerX, pointerY } from 'zinc:gfx';

/** The id of the finger the mouse button stands for. */
export const MOUSE: i32 = -2;
/** A press shorter than this, that moved less than this (table units), is a tap. */
const TAP_SECONDS = 0.35, TAP_TRAVEL = 14;

/** One finger, in table units. */
export class Finger {
  id: i32;
  x: number;
  y: number;
  /** Where it was at the previous frame (where it is now, on the frame it lands). */
  px: number;
  py: number;
  /** Seconds since it landed, and the distance it has travelled. */
  age = 0;
  travel = 0;
  /** True on the frame it lands. */
  fresh = true;
  /** What it landed on, as the owner numbers it (0: nothing yet). */
  owner: i32 = 0;
  constructor(id: i32, x: number, y: number) { this.id = id; this.x = x; this.y = y; this.px = x; this.py = y; }
  /** True for a finger that has just lifted after a short press in place. */
  get tapped(): boolean { return this.age < TAP_SECONDS && this.travel < TAP_TRAVEL; }
}

export class Fingers {
  /** On the table now, in the order they landed. */
  down: Finger[] = [];
  /** Lifted during this frame. */
  lifted: Finger[] = [];
  /** Seconds since a touch screen was last touched: its taps also arrive as mouse presses, which are not a second finger. */
  private sinceTouch = 10;
  /** The fingers that landed beside the box: they are nobody's until they lift, also when they slide into it. */
  private beside: i32[] = [];

  /** Reads this frame's touch points, or the mouse when there is none. The table's origin is at (ox, oy) on the screen and one table unit
   *  is `k` pixels. A finger counts when it lands in the box (left, top, wide, high) of the table's plane: the part of the window the
   *  player has, which is all of it in the table's own app and a pane in the editor. */
  update(dt: number, ox: number, oy: number, k: number, left: number, top: number, wide: number, high: number): void {
    const ids: i32[] = [], xs: number[] = [], ys: number[] = [];
    const n = touchCount();
    for (let i: i32 = 0; i < n; i++) { ids.push(touchId(i)); xs.push((touchX(i) - ox) / k); ys.push((touchY(i) - oy) / k); }
    this.sinceTouch = n > 0 ? 0 : this.sinceTouch + dt;
    if (n === 0 && this.sinceTouch > 0.5 && pointerDown()) { ids.push(MOUSE); xs.push((pointerX() - ox) / k); ys.push((pointerY() - oy) / k); }

    this.lifted = [];
    this.beside = this.beside.filter((id: i32) => ids.indexOf(id) >= 0);
    const still: Finger[] = [];
    for (const f of this.down) {
      const i = ids.indexOf(f.id);
      if (i < 0) { this.lifted.push(f); continue; }
      f.px = f.x; f.py = f.y; f.x = xs[i]; f.y = ys[i];
      f.travel += Math.abs(f.x - f.px) + Math.abs(f.y - f.py);
      f.age += dt;
      f.fresh = false;
      ids[i] = -1000;   // seen
      still.push(f);
    }
    for (let i = 0; i < ids.length; i++) {
      if (ids[i] === -1000 || this.beside.indexOf(ids[i]) >= 0) continue;
      if (xs[i] < left || ys[i] < top || xs[i] > left + wide || ys[i] > top + high) this.beside.push(ids[i]);
      else still.push(new Finger(ids[i], xs[i], ys[i]));
    }
    this.down = still;
  }
  /** The fingers on the table that belong to `owner`, in landing order. */
  of(owner: i32): Finger[] { return this.down.filter((f: Finger) => f.owner === owner); }
}

/** Where a thing lies on the table: its centre, its size as a factor of the designed one, and its turn in radians, clockwise. */
export class Pose {
  x = 0;
  y = 0;
  scale = 1;
  angle = 0;
}

/** Moves `p` with the fingers that hold it, by what they did since the previous frame: one finger drags; two drag, turn and zoom about
 *  their midpoint (more than two: the first two). Only motion counts, never positions, so a finger that lands or lifts in the middle of a
 *  gesture cannot make the thing jump. The scale stays within [smallest, largest]. */
export function manipulate(p: Pose, held: Finger[], smallest: number, largest: number): void {
  if (held.length === 0) return;
  const a = held[0];
  if (held.length === 1) { p.x += a.x - a.px; p.y += a.y - a.py; return; }
  const b = held[1];
  const wasX = b.px - a.px, wasY = b.py - a.py, isX = b.x - a.x, isY = b.y - a.y;
  const was = Math.sqrt(wasX * wasX + wasY * wasY), is = Math.sqrt(isX * isX + isY * isY);
  let grow = 1, turn = 0;
  if (was > 8 && is > 8) {   // fingers almost on each other give no direction
    grow = Math.min(largest, Math.max(smallest, p.scale * is / was)) / p.scale;
    turn = Math.atan2(isY, isX) - Math.atan2(wasY, wasX);
    if (turn > Math.PI) turn -= 2 * Math.PI;
    if (turn < -Math.PI) turn += 2 * Math.PI;
  }
  // the centre follows the midpoint, turned and scaled about it
  const fromX = p.x - (a.px + b.px) / 2, fromY = p.y - (a.py + b.py) / 2, c = Math.cos(turn) * grow, s = Math.sin(turn) * grow;
  p.x = (a.x + b.x) / 2 + fromX * c - fromY * s;
  p.y = (a.y + b.y) / 2 + fromX * s + fromY * c;
  p.scale *= grow;
  p.angle += turn;
}
