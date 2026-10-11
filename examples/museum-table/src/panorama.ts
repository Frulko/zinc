// 360-degree panoramas (ZN-650.09): an equirectangular image seen from the inside of a sphere with zinc:3d. A finger looks around and the
// view keeps turning a little when it lets go; a pinch or the wheel changes the field of view (orbit.ts, shared with the object viewer);
// points of interest are projected with the
// same camera every frame, so they stay on their direction. Directions: y up, -z the middle of the image, +x a quarter turn to the right.
// On a table the image stands upright for the visitor at any of its four sides: `side` rolls the camera by quarter turns, and `project`
// and `unproject` roll with it.
import { Scene, Camera, Node, Material, Mesh, Shading } from 'zinc:3d';
import { View } from './project';
import { Orbit } from './orbit';

export const FOV_MIN = 30;
export const FOV_MAX = 100;
const PITCH_MAX = 85;
const RADIUS = 10;
/** The visitor's right on the screen (x to the right, y down), by the side of the table they stand at; their up is (RY, -RX). */
const RX: number[] = [1, 0, -1, 0], RY: number[] = [0, -1, 0, 1];

/** The unit direction of (yaw, pitch) in degrees. */
export function direction(yaw: number, pitch: number): number[] {
  const y = yaw * Math.PI / 180, p = pitch * Math.PI / 180;
  return [Math.cos(p) * Math.sin(y), Math.sin(p), -Math.cos(p) * Math.cos(y)];
}

/** The inside of a sphere: seen from its centre, the image runs left to right as the yaw goes from -180 to 180 degrees. */
function insideSphere(segments: i32, rings: i32): Mesh {
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: i32[] = [];
  for (let r: i32 = 0; r <= rings; r++) {
    const phi = Math.PI * r / rings, y = Math.cos(phi), sr = Math.sin(phi);
    for (let s: i32 = 0; s <= segments; s++) {
      const th = 2 * Math.PI * s / segments, x = sr * Math.sin(th), z = sr * Math.cos(th);
      pos.push(x * RADIUS); pos.push(y * RADIUS); pos.push(z * RADIUS);
      nrm.push(-x); nrm.push(-y); nrm.push(-z);
      uv.push(1 - s / segments); uv.push(r / rings);
    }
  }
  for (let r: i32 = 0; r < rings; r++)
    for (let s: i32 = 0; s < segments; s++) {
      const a = r * (segments + 1) + s, b = a + segments + 1;
      idx.push(a); idx.push(a + 1); idx.push(b);
      idx.push(a + 1); idx.push(b + 1); idx.push(b);
    }
  return new Mesh(pos, idx, nrm, uv, []);
}

export class PanoramaView extends Orbit {
  private readonly scene = new Scene();
  private readonly camera = new Camera();
  private readonly sphere: Mesh = insideSphere(64, 32);
  /** The side of the table the visitor stands at (frame.ts: 0 the bottom of the screen, 1 the right, 2 the top, 3 the left): the image
   *  is upright for them, and the field of view is that of the height they see. */
  side: i32 = 0;

  constructor(image: i32, view: View) {
    super();
    this.nearest = FOV_MIN; this.farthest = FOV_MAX; this.steepest = PITCH_MAX;
    const m = new Material(0xffffff);
    m.texture = image;
    m.shading = Shading.Unlit;
    m.doubleSided = true;
    this.scene.add(new Node(this.sphere, m));
    this.camera.setPosition(0, 0, 0);
    this.camera.near = 0.1;
    this.camera.far = RADIUS * 2;
    this.set(view);
  }

  /** Frees the sphere and the picture the view is drawn into (the panorama's image is its owner's). */
  dispose(): void { this.camera.dispose(); this.sphere.dispose(); }

  /** The field of view in degrees: what a pinch changes here. */
  get fov(): number { return this.reach; }
  set fov(degrees: number) { this.reach = degrees; }

  set(v: View): void { this.place(v.yaw, v.pitch, v.fov); }

  /** The finger moved by (dx, dy) screen pixels over `dt` seconds on a view `h` pixels high: the image follows it. */
  drag(dx: number, dy: number, h: number, dt: number): void {
    const k = this.fov / Math.max(1, h);
    this.turn(-dx * k, dy * k, dt);
  }

  /** A pinch or wheel step: `k` above 1 zooms in. */
  zoom(k: number): void { this.closer(k); }

  /** Glide to `v` in `seconds`. */
  glideTo(v: View, seconds: number): void { this.glide(v.yaw, v.pitch, v.fov, seconds); }

  /** The camera's forward, right and up vectors (zinc:3d's lookAt with y up): [fx, fy, fz, rx, 0, rz, ux, uy, uz]. */
  private axes(): number[] {
    const f = direction(this.yaw, this.pitch);
    let rx = -f[2], rz = f[0];
    const rl = Math.max(1e-9, Math.sqrt(rx * rx + rz * rz));
    rx /= rl; rz /= rl;
    return [f[0], f[1], f[2], rx, 0, rz, -rz * f[1], rz * f[0] - rx * f[2], rx * f[1]];
  }
  /** Pixels per unit of tangent on a view w by h: the field of view is across the height the visitor sees. */
  private focal(w: number, h: number): number { return ((this.side % 2 === 1 ? w : h) / 2) / Math.tan(this.fov * Math.PI / 360); }

  draw(x: number, y: number, w: number, h: number): void {
    const a = this.axes(), ru = -RY[this.side], uu = RX[this.side];   // the top of the picture: the visitor's up, right, down or left
    this.camera.lookAt(a[0], a[1], a[2]);
    this.camera.up = this.side === 0 ? [0, 1, 0] : [ru * a[3] + uu * a[6], uu * a[7], ru * a[5] + uu * a[8]];
    this.camera.fov = this.side % 2 === 1 ? 2 * Math.atan2(h / 2, this.focal(w, h)) * 180 / Math.PI : this.fov;
    this.camera.render(this.scene, x, y, w, h);
  }

  /** Where the direction `at` is on the view (x, y, w, h): [sx, sy], or an empty array when it is behind the camera. */
  project(at: number[], x: number, y: number, w: number, h: number): number[] {
    const a = this.axes(), len = Math.sqrt(at[0] * at[0] + at[1] * at[1] + at[2] * at[2]);
    if (len <= 0) return [];
    const px = at[0] / len, py = at[1] / len, pz = at[2] / len;
    const cz = px * a[0] + py * a[1] + pz * a[2];
    if (cz <= 0.05) return [];
    // to the visitor's right and up, then on the screen
    const s = this.focal(w, h), right = (px * a[3] + pz * a[5]) / cz * s, up = (px * a[6] + py * a[7] + pz * a[8]) / cz * s, RX0 = RX[this.side], RY0 = RY[this.side];
    return [x + w / 2 + right * RX0 + up * RY0, y + h / 2 + right * RY0 - up * RX0];
  }

  /** The inverse of `project`: the direction seen at the point (sx, sy) of the view (x, y, w, h), as a unit vector. The storyboard editor
   *  finds with it the direction under a click. */
  unproject(sx: number, sy: number, x: number, y: number, w: number, h: number): number[] {
    const v = this.axes(), s = this.focal(w, h), mx = (sx - x - w / 2) / s, my = (sy - y - h / 2) / s, RX0 = RX[this.side], RY0 = RY[this.side];
    const a = mx * RX0 + my * RY0, b = mx * RY0 - my * RX0;   // to the visitor's right and up
    const dx = v[0] + a * v[3] + b * v[6], dy = v[1] + b * v[7], dz = v[2] + a * v[5] + b * v[8], len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return [dx / len, dy / len, dz / len];
  }
}
