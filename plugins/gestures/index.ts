// zinc:gestures: pan, zoom and rotate from mouse drag, wheel, trackpad pinch and multitouch (zinc:gfx input),
// plus tap / double-tap and release velocity for inertia. Call update() once per frame, then read the fields.
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
