// 360-degree panoramas (ZN-650.09): an equirectangular image seen from the inside of a sphere with zinc:3d. A finger looks around and the
// view keeps turning a little when it lets go; a pinch or the wheel changes the field of view (orbit.ts, shared with the object viewer);
// points of interest are projected with the
// same camera every frame, so they stay on their direction. Directions: y up, -z the middle of the image, +x a quarter turn to the right.
import { Scene, Camera, Node, Material, Mesh, Shading } from 'zinc:3d';
import { View } from './project';
import { Orbit } from './orbit';

export const FOV_MIN = 30;
export const FOV_MAX = 100;
const PITCH_MAX = 85;
const RADIUS = 10;

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

  draw(x: number, y: number, w: number, h: number): void {
    const d = direction(this.yaw, this.pitch);
    this.camera.lookAt(d[0], d[1], d[2]);
    this.camera.fov = this.fov;
    this.camera.render(this.scene, x, y, w, h);
  }

  /** Where the direction `at` is on the view (x, y, w, h): [sx, sy], or an empty array when it is behind the camera. */
  project(at: number[], x: number, y: number, w: number, h: number): number[] {
    const f = direction(this.yaw, this.pitch);
    const len = Math.sqrt(at[0] * at[0] + at[1] * at[1] + at[2] * at[2]);
    if (len <= 0) return [];
    const px = at[0] / len, py = at[1] / len, pz = at[2] / len;
    // the camera's right and up vectors (zinc:3d's lookAt with y up)
    let rx = -f[2], rz = f[0];
    const rl = Math.sqrt(rx * rx + rz * rz);
    if (rl <= 1e-9) return [];
    rx /= rl; rz /= rl;
    const ux = -rz * f[1], uy = rz * f[0] - rx * f[2], uz = rx * f[1];
    const cz = px * f[0] + py * f[1] + pz * f[2];
    if (cz <= 0.05) return [];
    const cx = px * rx + pz * rz, cy = px * ux + py * uy + pz * uz;
    const s = (h / 2) / Math.tan(this.fov * Math.PI / 360);
    return [x + w / 2 + cx / cz * s, y + h / 2 - cy / cz * s];
  }
}
