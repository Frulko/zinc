// Flippers: a tapered capsule (a pivot circle, a tip circle and the two lines tangent to both) rotating about the
// pivot, driven like a solenoid: a strong constant angular acceleration up to a top speed while the button is held,
// a weaker return spring when released, hard end stops. The flipper is kinematic (infinite mass): at a contact the
// ball sees the surface velocity omega x (contact - pivot), and the impulse is computed on the relative velocity, so
// a moving flipper hands its speed to the ball (a full flip), a slow one barely does (a tap pass), and a flipper held
// up at rest is a still ramp the ball can settle on (a cradle).
import { FLIPPER_SPEED_DEGREES, FLIPPER_RETURN_DEGREES } from '../tuning';
import { Segment, FLIPPER_RUBBER, K_FLIPPER } from './bodies';

export const FLIP_ACCEL: number = 1800;     // rad/s² while the coil is energised
export const FLIP_MAX_W: number = FLIPPER_SPEED_DEGREES * Math.PI / 180;       // rad/s: about 104 in/s at the tip
export const RETURN_ACCEL: number = 900;   // rad/s², the return spring
export const RETURN_MAX_W: number = FLIPPER_RETURN_DEGREES * Math.PI / 180;

export class Flipper {
  angle: number;
  omega: number = 0;
  sweepOmega: number = 0;
  previousAngle: number = 0;
  pressed: boolean = false;
  /** false while tilted: the coil no longer answers. */
  enabled: boolean = true;
  tipX: number = 0;
  tipY: number = 0;
  /** The two tangent edges, outward normals, one-sided (the ball is never inside a flipper). */
  edgeA: Segment;
  edgeB: Segment;
  /** Signed direction of the up stroke: -1 for a left flipper (its angle decreases), +1 for a right one. */
  readonly stroke: number;

  constructor(public px: number, public py: number, public len: number, public r0: number, public r1: number,
    public rest: number, public up: number, public tag: i32) {
    this.angle = rest;
    this.stroke = up > rest ? 1 : -1;
    this.edgeA = new Segment(0, 0, 1, 0, 0, FLIPPER_RUBBER, K_FLIPPER, tag);
    this.edgeB = new Segment(0, 0, 1, 0, 0, FLIPPER_RUBBER, K_FLIPPER, tag);
    this.edgeA.oneSided = true; this.edgeB.oneSided = true;
    this.pose(this.angle);
  }

  /** Advances the coil by dt (one physics substep). */
  update(dt: number): void {
    this.previousAngle = this.angle;
    const s = this.stroke;
    if (this.pressed && this.enabled) {
      this.omega += s * FLIP_ACCEL * dt;
      if (this.omega * s > FLIP_MAX_W) this.omega = s * FLIP_MAX_W;
    } else {
      this.omega -= s * RETURN_ACCEL * dt;
      if (this.omega * s < -RETURN_MAX_W) this.omega = -s * RETURN_MAX_W;
    }
    this.angle += this.omega * dt;
    if ((this.angle - this.up) * s >= 0) { this.angle = this.up; if (this.omega * s > 0) this.omega = 0; }
    if ((this.angle - this.rest) * s <= 0) { this.angle = this.rest; if (this.omega * s < 0) this.omega = 0; }
    this.sweepOmega = (this.angle - this.previousAngle) / dt;
    if (this.angle !== this.previousAngle) this.pose(this.angle);
  }

  /** Recomputes the tip and the tangent edges for the current angle. */
  pose(angle: number): void {
    const c = Math.cos(angle), sn = Math.sin(angle);
    this.tipX = this.px + c * this.len; this.tipY = this.py + sn * this.len;
    // tangent lines of two circles: normal n = perp * cos(b) + axis * sin(b), sin(b) = (r0 - r1) / len
    const sb = (this.r0 - this.r1) / this.len, cb = Math.sqrt(1 - sb * sb);
    const pxn = -sn, pyn = c;   // perpendicular to the axis
    for (let k: i32 = 0; k < 2; k++) {
      const side: number = k === 0 ? 1 : -1;
      const nx = pxn * side * cb + c * sb, ny = pyn * side * cb + sn * sb;
      const e = k === 0 ? this.edgeA : this.edgeB;
      const ax = this.px + nx * this.r0, ay = this.py + ny * this.r0;
      const bx = this.tipX + nx * this.r1, by = this.tipY + ny * this.r1;
      // order a -> b so that the segment's left normal is the outward one
      if (side > 0) e.place(bx, by, ax, ay); else e.place(ax, ay, bx, by);
    }
  }

  /** Fraction of the stroke, 0 at rest, 1 fully up (for drawing and the attract-mode player). */
  lift(): number { return (this.angle - this.rest) / (this.up - this.rest); }
}
