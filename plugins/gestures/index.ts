// zinc:gestures: pan, zoom and rotate from mouse drag, wheel, trackpad pinch and multitouch (zinc:gfx input),
// plus tap / double-tap and release velocity for inertia. Call update() once per frame, then read the fields.
// Several things under several hands: Fingers gives each finger to what it landed on until it lifts, and manipulate() drags, turns and
// zooms a Pose with the fingers that hold it, glide() lets it coast on when they let go.
import { pointerX, pointerY, pointerDown, wheel, pinch, touchCount, touchX, touchY, touchId } from 'zinc:gfx';

export class Gestures {
  /** Pan this frame (px). */
  dx = 0;
  dy = 0;
  /** Zoom factor this frame (two-finger spread, trackpad pinch, wheel). */
  scale = 1;
  /** Rotation this frame (radians, two fingers). */
  rotate = 0;
  /** Focus: pointer, or the centroid of the fingers. */
  x = 0;
  y = 0;
  /** A finger or the mouse button is down (a gesture that started inside the region). */
  active = false;
  /** Set for one frame when the gesture ends; vx/vy: release velocity (px/s) for inertia. */
  released = false;
  vx = 0;
  vy = 0;
  tap = false;
  doubleTap = false;
  /** Zoom factor per wheel notch. */
  wheelStep = 1.25;

  private n: i32 = 0;           // fingers (or 1 for the mouse) in the previous frame
  private id0: i32 = -1;
  private id1: i32 = -1;
  private px = 0;
  private py = 0;
  private dist = 0;
  private angle = 0;
  private downX = 0;
  private downY = 0;
  private downT = 0;
  private moved = 0;
  private lastTapT = -1;
  private lastTapX = 0;
  private lastTapY = 0;
  private t = 0;

  /** Reads this frame's input; gestures start only inside the region (x, y, w, h). */
  update(dt: number, rx: number, ry: number, rw: number, rh: number): void {
    this.t += dt;
    this.dx = 0; this.dy = 0; this.scale = 1; this.rotate = 0;
    this.released = false; this.tap = false; this.doubleTap = false;
    const inside = (x: number, y: number): boolean => x >= rx && y >= ry && x < rx + rw && y < ry + rh;

    // points: touches when present, else the mouse button
    const tc = touchCount();
    let n: i32 = 0, ax = 0, ay = 0, bx = 0, by = 0, a: i32 = -1, b: i32 = -1;
    if (tc > 0) {
      n = tc >= 2 ? 2 : 1;
      a = touchId(0); ax = touchX(0); ay = touchY(0);
      if (n === 2) { b = touchId(1); bx = touchX(1); by = touchY(1); }
    } else if (pointerDown()) { n = 1; a = -2; ax = pointerX(); ay = pointerY(); }
    const cx = n === 2 ? (ax + bx) / 2 : ax, cy = n === 2 ? (ay + by) / 2 : ay;

    if (n > 0 && this.n === 0 && !inside(cx, cy)) n = 0;  // pressed elsewhere (a button)
    if (n > 0 && this.n === 0 && !this.active) { this.downX = cx; this.downY = cy; this.downT = this.t; this.moved = 0; this.vx = 0; this.vy = 0; }
    if (n > 0 && (this.active || this.n === 0)) {
      const same = n === this.n && a === this.id0 && b === this.id1;
      if (same) {
        this.dx = cx - this.px; this.dy = cy - this.py;
        this.moved += Math.abs(this.dx) + Math.abs(this.dy);
        if (n === 2) {
          const d = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay)), an = Math.atan2(by - ay, bx - ax);
          if (this.dist > 0 && d > 0) this.scale = d / this.dist;
          let r = an - this.angle;
          if (r > Math.PI) r -= 2 * Math.PI;
          if (r < -Math.PI) r += 2 * Math.PI;
          this.rotate = r;
          this.dist = d; this.angle = an;
        }
        if (dt > 0) { const k = Math.min(1, dt * 12); this.vx += (this.dx / dt - this.vx) * k; this.vy += (this.dy / dt - this.vy) * k; }
      } else if (n === 2) {  // finger count changed: new reference, no jump
        this.dist = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay)); this.angle = Math.atan2(by - ay, bx - ax);
        this.moved += 100;  // two fingers never make a tap
      }
      this.active = true;
      this.px = cx; this.py = cy; this.id0 = a; this.id1 = b;
      this.x = cx; this.y = cy;
    } else if (this.active && n === 0) {
      this.active = false; this.released = true;
      if (this.t - this.downT < 0.3 && this.moved < 12) {
        this.vx = 0; this.vy = 0;
        this.tap = true;
        if (this.lastTapT >= 0 && this.t - this.lastTapT < 0.4 && Math.abs(this.px - this.lastTapX) + Math.abs(this.py - this.lastTapY) < 30) { this.doubleTap = true; this.lastTapT = -1; }
        else { this.lastTapT = this.t; this.lastTapX = this.px; this.lastTapY = this.py; }
      }
    }
    this.n = n;
    if (!this.active) { this.x = pointerX(); this.y = pointerY(); }

    // wheel and trackpad pinch zoom around the pointer
    const w = wheel(), p = pinch();
    if ((w !== 0 || p !== 1) && inside(pointerX(), pointerY())) {
      this.scale *= Math.pow(this.wheelStep, w) * p;
      this.x = pointerX(); this.y = pointerY();
    }
  }
}

/** The id of the finger the mouse button stands for. */
export const MOUSE: i32 = -2;
/** A press shorter than this (seconds), that moved less than this (units of Fingers.update), is a tap. */
const TAP_SECONDS = 0.35, TAP_TRAVEL = 14;

/** One finger, in the units Fingers.update was given. */
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
  /** What it landed on, as the program numbers its targets (0: nothing yet). Set it on a fresh finger to take it. */
  owner: i32 = 0;
  constructor(id: i32, x: number, y: number) { this.id = id; this.x = x; this.y = y; this.px = x; this.py = y; }
  /** True for a finger that has just lifted after a short press in place. */
  get tapped(): boolean { return this.age < TAP_SECONDS && this.travel < TAP_TRAVEL; }
}

/** The fingers on the screen, each owned by the target it landed on until it lifts: several hands work on several things at once. A mouse
 *  stands in for one finger where there is no touch screen. */
export class Fingers {
  /** Down now, in the order they landed. */
  down: Finger[] = [];
  /** Lifted during this frame. */
  lifted: Finger[] = [];
  /** Seconds since a touch screen was last touched: its taps also arrive as mouse presses, which are not a second finger. */
  private sinceTouch = 10;
  /** The fingers that landed beside the box: they are nobody's until they lift, also when they slide into it. */
  private beside: i32[] = [];

  /** Reads this frame's touch points, or the mouse when there is none. Positions are given in a plane whose origin is at (ox, oy) on the
   *  screen and whose unit is `k` pixels (screen pixels by default). A finger counts when it lands in the box (left, top, wide, high) of
   *  that plane. */
  update(dt: number, ox: number = 0, oy: number = 0, k: number = 1, left: number = -1e9, top: number = -1e9, wide: number = 2e9, high: number = 2e9): void {
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
  /** The fingers that belong to `owner`, in landing order. */
  of(owner: i32): Finger[] { return this.down.filter((f: Finger) => f.owner === owner); }
}

/** Where a thing lies: its centre, its size as a factor of the designed one, its turn in radians (clockwise on a y-down screen), and the
 *  speed it would leave its fingers with (units/s, radians/s), which glide() spends. */
export class Pose {
  x = 0;
  y = 0;
  scale = 1;
  angle = 0;
  vx = 0;
  vy = 0;
  va = 0;
}

/** Moves `p` with the fingers that hold it, by what they did since the previous frame: one finger drags; two drag, turn and zoom about
 *  their midpoint (more than two: the first two). Only motion counts, never positions, so a finger that lands or lifts in the middle of a
 *  gesture cannot make the thing jump. The scale stays within [smallest, largest]. With the frame's `dt`, the speed of p is followed too,
 *  smoothed over a few frames, for glide(). */
export function manipulate(p: Pose, held: Finger[], smallest: number, largest: number, dt: number = 0): void {
  if (held.length === 0) return;
  const x0 = p.x, y0 = p.y, a0 = p.angle, a = held[0];
  if (held.length === 1) { p.x += a.x - a.px; p.y += a.y - a.py; }
  else {
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
  if (dt > 0) {   // the speed it would leave with, smoothed over a few frames: a pause before the release leaves little of it
    const follow = Math.min(1, 18 * dt);
    p.vx += ((p.x - x0) / dt - p.vx) * follow;
    p.vy += ((p.y - y0) / dt - p.vy) * follow;
    p.va += ((p.angle - a0) / dt - p.va) * follow;
  }
}

/** Inertia: a released `p` coasts on with its speed, which friction spends (`friction` per second for the slide, `spin` for the turn) until
 *  it falls under `rest` units/s (0.02 radians/s for the turn). */
export function glide(p: Pose, dt: number, friction: number = 4, spin: number = 6, rest: number = 4): void {
  p.x += p.vx * dt; p.y += p.vy * dt; p.angle += p.va * dt;
  const slow = Math.exp(-friction * dt), turnSlow = Math.exp(-spin * dt);
  p.vx *= slow; p.vy *= slow; p.va *= turnSlow;
  if (Math.abs(p.vx) + Math.abs(p.vy) < rest) { p.vx = 0; p.vy = 0; }
  if (Math.abs(p.va) < 0.02) p.va = 0;
}
