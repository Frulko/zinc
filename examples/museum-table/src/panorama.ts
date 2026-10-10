// 360-degree panoramas (ZN-650.09): an equirectangular image seen from the inside of a sphere with zinc:3d. A finger looks around and the
// view keeps turning a little when it lets go; a pinch or the wheel changes the field of view; points of interest are projected with the
// same camera every frame, so they stay on their direction. Directions: y up, -z the middle of the image, +x a quarter turn to the right.
import { Scene, Camera, Node, Material, Mesh, Shading } from 'zinc:3d';
import { View } from './project';

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

export class PanoramaView {
  yaw = 0;
  pitch = 0;
  fov = 75;
  /** Inertia after a drag, in degrees per second. */
  private vyaw = 0;
  private vpitch = 0;
  /** A view the camera glides to (opening a point), and how far along. */
  private goal: View | null = null;
  private from: View = new View();
  private glide = 0;
  private readonly scene = new Scene();
  private readonly camera = new Camera();

  constructor(image: i32, view: View) {
    const m = new Material(0xffffff);
    m.texture = image;
    m.shading = Shading.Unlit;
    m.doubleSided = true;
    this.scene.add(new Node(insideSphere(64, 32), m));
    this.camera.setPosition(0, 0, 0);
    this.camera.near = 0.1;
    this.camera.far = RADIUS * 2;
    this.set(view);
  }

  set(v: View): void { this.yaw = v.yaw; this.pitch = v.pitch; this.fov = v.fov; this.vyaw = 0; this.vpitch = 0; this.goal = null; this.clamp(); }

  /** The finger moved by (dx, dy) screen pixels over `dt` seconds on a view `h` pixels high: the image follows it. */
  drag(dx: number, dy: number, h: number, dt: number): void {
    const k = this.fov / Math.max(1, h);
    this.yaw -= dx * k; this.pitch += dy * k;
    this.goal = null;
    if (dt > 0) { this.vyaw = this.vyaw * 0.5 + (-dx * k / dt) * 0.5; this.vpitch = this.vpitch * 0.5 + (dy * k / dt) * 0.5; }
    this.clamp();
  }
  /** The finger stayed still: no inertia when it lets go. */
  hold(): void { this.vyaw = 0; this.vpitch = 0; }

  /** A pinch or wheel step: `k` above 1 zooms in. */
  zoom(k: number): void {
    if (k > 0) this.fov = Math.min(FOV_MAX, Math.max(FOV_MIN, this.fov / k));
  }

  /** Glide to `v` in `seconds`. */
  glideTo(v: View, seconds: number): void {
    this.from = new View();
    this.from.yaw = this.yaw; this.from.pitch = this.pitch; this.from.fov = this.fov;
    let target = v.yaw;   // the short way round
    while (target - this.yaw > 180) target -= 360;
    while (target - this.yaw < -180) target += 360;
    const g = new View();
    g.yaw = target; g.pitch = v.pitch; g.fov = v.fov;
    this.goal = g;
    this.glide = seconds > 0 ? 0 : 1;
    this.vyaw = 0; this.vpitch = 0;
  }

  /** Whether the view still moves by itself (inertia or a glide). */
  moving(): boolean { return this.goal !== null || this.vyaw !== 0 || this.vpitch !== 0; }

  step(dt: number, dragging: boolean): void {
    const g = this.goal;
    if (g !== null) {
      this.glide = Math.min(1, this.glide + dt / 0.6);
      const t = this.glide * this.glide * (3 - 2 * this.glide);
      this.yaw = this.from.yaw + (g.yaw - this.from.yaw) * t;
      this.pitch = this.from.pitch + (g.pitch - this.from.pitch) * t;
      this.fov = this.from.fov + (g.fov - this.from.fov) * t;
      if (this.glide >= 1) this.goal = null;
    } else if (!dragging) {
      this.yaw += this.vyaw * dt; this.pitch += this.vpitch * dt;
      const decay = Math.exp(-4 * dt);
      this.vyaw *= decay; this.vpitch *= decay;
      if (Math.abs(this.vyaw) < 0.5 && Math.abs(this.vpitch) < 0.5) { this.vyaw = 0; this.vpitch = 0; }
    }
    this.clamp();
  }

  private clamp(): void {
    while (this.yaw > 180) this.yaw -= 360;
    while (this.yaw <= -180) this.yaw += 360;
    this.pitch = Math.min(PITCH_MAX, Math.max(-PITCH_MAX, this.pitch));
    this.fov = Math.min(FOV_MAX, Math.max(FOV_MIN, this.fov));
  }

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
