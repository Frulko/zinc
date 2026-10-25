// The flight, ported from tokyo-sim's tour.rs, camera.rs and flight.rs: the tour carries the eye through a closed loop of places on a
// Catmull-Rom curve at a steady speed, lifted over what stands on its way two seconds ahead; the pad takes the eye off it and flies freely,
// and Start hands it back (the eye glides to the path, it does not cut).
import { City } from './city';
import { Pad } from './input';
import { TOUR_SPEED, CLEARANCE, FLOOR, CEILING, CLOCK_RATE, CLOCK_TURN, FIELD_OF_VIEW } from './constants';

function ease(cur: number, target: number, rate: number, dt: number): number { return target + (cur - target) * Math.exp(-rate * dt); }
function curve(a: number, b: number, c: number, d: number, t: number): number {
  const t2 = t * t, t3 = t2 * t;
  return (b * 2 + (c - a) * t + (a * 2 - b * 5 + c * 4 - d) * t2 + (b * 3 - a - c * 3 + d) * t3) * 0.5;
}

export class Flight {
  readonly eye: number[] = [0, 0, 0];
  readonly target: number[] = [0, 0, 0];
  /** The unit direction looked along. */
  readonly look: number[] = [0, 0, -1];
  touring = true;
  hour = 15.5;
  rate: number = CLOCK_RATE;
  fov: number = FIELD_OF_VIEW;
  private keys: number[][];
  private at: number[] = [];
  private seconds = 0;
  private lift = -1;
  private yaw = 0;
  private pitch = 0;
  private vel: number[] = [0, 0, 0];
  private turnX = 0;
  private turnY = 0;
  private floor = -1e9;
  private join = 1;   // 0..1 on the way back to the tour
  private from: number[] = [0, 0, 0];
  private looked: number[] = [0, 0, 0];
  private joinSeconds = 2;
  private readonly p: number[] = [0, 0, 0];
  private readonly q: number[] = [0, 0, 0];

  constructor(city: City) {
    this.keys = city.tour;
    this.hour = city.hour;
    let t = 0;
    for (let i = 0; i < this.keys.length; i++) {
      this.at.push(t);
      const a = this.keys[i], b = this.keys[(i + 1) % this.keys.length];
      t += Math.max(Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 + (b[2] - a[2]) ** 2) / TOUR_SPEED, 1);
    }
    this.at.push(t);
    const v = city.view;
    this.setLook(v[0], v[1], v[2], v[3], v[4], v[5]);
    if (this.keys.length < 2) this.touring = false;
  }

  /** Where the eye will be in `s` seconds (`out`): on the tour, its path; in free flight, straight on at the present speed. */
  ahead(s: number, out: number[]): void {
    if (this.touring && this.keys.length >= 2) { this.tourAt(this.seconds + s, out, this.spare); return; }
    for (let c = 0; c < 3; c++) out[c] = this.eye[c] + this.vel[c] * s;
  }
  private readonly spare: number[] = [0, 0, 0];

  /** The tour's eye (`out` 0..2) and the point it looks at (3..5), `s` seconds in. */
  private tourAt(s: number, eye: number[], target: number[]): void {
    const n = this.keys.length, len = this.at[n];
    const t = s - Math.floor(s / len) * len;
    let i = 0;
    while (i + 1 < n && t >= this.at[i + 1]) i++;
    const u = (t - this.at[i]) / (this.at[i + 1] - this.at[i]);
    const k0 = this.keys[(i + n - 1) % n], k1 = this.keys[i], k2 = this.keys[(i + 1) % n], k3 = this.keys[(i + 2) % n];
    for (let c = 0; c < 3; c++) {
      eye[c] = curve(k0[c], k1[c], k2[c], k3[c], u);
      target[c] = curve(k0[c + 3], k1[c + 3], k2[c + 3], k3[c + 3], u);
    }
  }

  private around(city: City, x: number, z: number): number {
    let h = city.top(x, z);
    h = Math.max(h, city.top(x + CLEARANCE, z), city.top(x - CLEARANCE, z), city.top(x, z + CLEARANCE), city.top(x, z - CLEARANCE));
    return h;
  }

  private setLook(x: number, y: number, z: number, tx: number, ty: number, tz: number): void {
    this.eye[0] = x; this.eye[1] = y; this.eye[2] = z;
    let dx = tx - x, dy = ty - y, dz = tz - z;
    const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    dx /= l; dy /= l; dz /= l;
    this.look[0] = dx; this.look[1] = dy; this.look[2] = dz;
    this.target[0] = x + dx * 100; this.target[1] = y + dy * 100; this.target[2] = z + dz * 100;
    this.yaw = Math.atan2(dz, dx); this.pitch = Math.asin(Math.max(-1, Math.min(1, dy)));
  }

  step(city: City, pad: Pad, dt: number): void {
    this.hour += (this.rate + pad.clock * CLOCK_TURN) * dt;
    this.hour -= Math.floor(this.hour / 24) * 24;
    if (pad.toggleTour && this.keys.length >= 2) {
      this.touring = !this.touring;
      if (this.touring) {   // glide back to the path
        for (let c = 0; c < 3; c++) { this.from[c] = this.eye[c]; this.looked[c] = this.eye[c] + this.look[c] * 400; }
        this.tourAt(this.seconds, this.p, this.q);
        const d = Math.sqrt((this.p[0] - this.eye[0]) ** 2 + (this.p[1] - this.eye[1]) ** 2 + (this.p[2] - this.eye[2]) ** 2);
        this.joinSeconds = Math.max(1.5, Math.min(5, d / 400));
        this.join = 0;
      }
    }
    if (this.touring && pad.flying()) this.touring = false;
    if (this.touring) this.tour(city, dt);
    else this.fly(city, pad, dt);
  }

  private tour(city: City, dt: number): void {
    this.seconds += dt;
    const p = this.p, q = this.q;
    this.tourAt(this.seconds, p, q);
    // what the path must clear, here and over the two seconds ahead: the eye rises before a tower, in a slope
    let need = 0;
    const e = [0, 0, 0], t = [0, 0, 0];
    for (let k = 0; k < 6; k++) {
      this.tourAt(this.seconds + k * 0.4, e, t);
      need = Math.max(need, this.around(city, e[0], e[2]) + CLEARANCE - e[1]);
    }
    this.lift = this.lift < 0 ? need : ease(this.lift, need, 1.6, dt);
    p[1] += this.lift;
    if (this.join < 1) {
      this.join = Math.min(1, this.join + dt / this.joinSeconds);
      const k = this.join * this.join * (3 - 2 * this.join);
      for (let c = 0; c < 3; c++) { p[c] = this.from[c] + (p[c] - this.from[c]) * k; q[c] = this.looked[c] + (q[c] - this.looked[c]) * k; }
    }
    this.setLook(p[0], p[1], p[2], q[0], q[1], q[2]);
    this.floor = -1e9;
  }

  private fly(city: City, pad: Pad, dt: number): void {
    // the floor follows what stands around at a pace, so a tower ahead lifts the eye over a second
    const want = this.around(city, this.eye[0], this.eye[2]) + CLEARANCE - FLOOR;
    this.floor = this.floor < -1e8 ? want : ease(this.floor, want, 3, dt);
    this.turnX = ease(this.turnX, pad.turn * 1.9, 9, dt);
    this.turnY = ease(this.turnY, pad.tilt * 1.3, 9, dt);
    this.yaw += this.turnX * dt;
    this.pitch = Math.max(-1.5, Math.min(1.2, this.pitch + this.turnY * dt));
    const cp = Math.cos(this.pitch);
    this.look[0] = cp * Math.cos(this.yaw); this.look[1] = Math.sin(this.pitch); this.look[2] = cp * Math.sin(this.yaw);
    // the speed grows with the height above the city
    const above = Math.max(this.eye[1] - city.top(this.eye[0], this.eye[2]), 0);
    const pace = Math.max(10, Math.min(260, 8 + above * 0.8)) * (pad.fast ? 2.5 : 1);
    const rx = -this.look[2], rz = this.look[0];   // look x up: the right hand, horizontal
    const rl = Math.sqrt(rx * rx + rz * rz) || 1;
    for (let c = 0; c < 3; c++) {
      const right = c === 0 ? rx / rl : c === 2 ? rz / rl : 0;
      const w = (this.look[c] * pad.ahead + right * pad.side) * pace + (c === 1 ? pad.climb * pace * 0.7 : 0);
      this.vel[c] = ease(this.vel[c], w, 5, dt);
      this.eye[c] += this.vel[c] * dt;
    }
    const floor = this.floor + FLOOR;
    if (this.eye[1] < floor) { this.eye[1] = Math.max(ease(this.eye[1], floor, 14, dt), floor - 2); this.vel[1] = Math.max(this.vel[1], 0); }
    this.eye[1] = Math.min(this.eye[1], CEILING);
    for (let c = 0; c < 3; c++) this.target[c] = this.eye[c] + this.look[c] * 100;
  }
}
