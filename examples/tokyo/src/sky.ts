// The clock and its light, ported from tokyo-sim's sky.rs: where the sun stands over Tokyo at an hour, the colours of the sun, the sky
// light and the haze that follow, and the sky as a dome of vertex colours around the eye (rebuilt when the light has changed).
import { Mesh, Node, Material, Shading, Scene, Light } from 'zinc:3d';

const LATITUDE = 0.62236;   // Tokyo Tower, 35.6586 N

/** Keys along the sun's height (sine of its elevation): the sun, the sky light, the horizon and the zenith (sky.rs KEYS). */
const KEY_H: number[] = [-0.30, -0.10, 0.00, 0.10, 0.30, 1.00];
const KEY_SUN: number[] = [0.10, 0.13, 0.22, 0.12, 0.14, 0.24, 0.95, 0.42, 0.16, 1.00, 0.68, 0.40, 1.00, 0.90, 0.76, 1.00, 0.96, 0.88];
const KEY_SKY: number[] = [0.10, 0.12, 0.20, 0.16, 0.17, 0.27, 0.34, 0.32, 0.40, 0.42, 0.44, 0.52, 0.46, 0.52, 0.62, 0.48, 0.55, 0.66];
const KEY_HORIZON: number[] = [0.10, 0.09, 0.12, 0.36, 0.24, 0.26, 0.95, 0.55, 0.30, 0.92, 0.74, 0.58, 0.76, 0.82, 0.90, 0.72, 0.80, 0.90];
const KEY_ZENITH: number[] = [0.015, 0.02, 0.05, 0.05, 0.07, 0.17, 0.16, 0.22, 0.42, 0.22, 0.36, 0.62, 0.20, 0.40, 0.72, 0.17, 0.36, 0.70];

const DOME_SEGMENTS: i32 = 16;
const DOME_RINGS: number[] = [-0.34, -0.10, 0.0, 0.09, 0.21, 0.41, 0.67, 0.91];

function saturate(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }
function smoothstep(a: number, b: number, v: number): number { const t = saturate((v - a) / (b - a)); return t * t * (3 - 2 * t); }
function channel(v: number): u32 { return Math.round(saturate(v) * 255); }
function pack(r: number, g: number, b: number): u32 { return (channel(r) << 16) | (channel(g) << 8) | channel(b); }

export class Sky {
  /** Towards the light (the sun by day, the moon at night), x east, y up, z south. */
  readonly dir: number[] = [0, 1, 0];
  readonly sunDir: number[] = [0, 1, 0];
  readonly sun: number[] = [1, 1, 1];
  readonly sky: number[] = [0.5, 0.5, 0.6];
  readonly horizon: number[] = [0.7, 0.8, 0.9];
  readonly zenith: number[] = [0.2, 0.4, 0.7];
  /** 0 by day, 1 when the city's lights are fully on. */
  night = 0;
  private readonly light = new Light(0, -1, 0, 0xffffff);
  private readonly dome = new Node(null, new Material(0xffffff));
  private builtAt = -100;
  private useDome: boolean;

  constructor(scene: Scene, dome: boolean) {
    scene.lights.push(this.light);
    this.useDome = dome;
    const m = this.dome.material;
    if (m !== null) { m.shading = Shading.Unlit; m.vertexColors = true; m.doubleSided = true; }
    if (dome) scene.add(this.dome);
  }

  /** The light of `hour` (0..24) on day `day` of the year, into the scene's light, ambient and background. */
  update(scene: Scene, hour: number, day: number, eye: number[], radius: number): void {
    const decl = -0.40928 * Math.cos(2 * Math.PI * (day + 10) / 365), h = (hour - 12) * Math.PI / 12;
    const sl = Math.sin(LATITUDE), cl = Math.cos(LATITUDE), sd = Math.sin(decl), cd = Math.cos(decl);
    const east = -cd * Math.sin(h), north = cl * sd - sl * cd * Math.cos(h), up = sl * sd + cl * cd * Math.cos(h);
    this.sunDir[0] = east; this.sunDir[1] = up; this.sunDir[2] = -north;
    let i: i32 = 0;
    while (i + 2 < KEY_H.length && up > KEY_H[i + 1]) i++;
    const t = saturate((up - KEY_H[i]) / (KEY_H[i + 1] - KEY_H[i]));
    for (let c = 0; c < 3; c++) {
      const a = i * 3 + c, b = a + 3;
      this.sun[c] = KEY_SUN[a] + (KEY_SUN[b] - KEY_SUN[a]) * t;
      this.sky[c] = KEY_SKY[a] + (KEY_SKY[b] - KEY_SKY[a]) * t;
      this.horizon[c] = KEY_HORIZON[a] + (KEY_HORIZON[b] - KEY_HORIZON[a]) * t;
      this.zenith[c] = KEY_ZENITH[a] + (KEY_ZENITH[b] - KEY_ZENITH[a]) * t;
    }
    this.night = smoothstep(0.12, -0.08, up);
    // below the horizon the sun gives way to the moon, opposite it and higher than it is low
    const bySun = smoothstep(-0.06, 0.02, up);
    let dx = east, dy = Math.max(up, 0.03), dz = -north;
    if (bySun <= 0) { dx = -east; dy = Math.max(-up, 0.35); dz = north; }
    const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
    this.dir[0] = dx / l; this.dir[1] = dy / l; this.dir[2] = dz / l;
    const fade = bySun > 0 ? bySun : smoothstep(-0.06, -0.16, up) * 0.9;
    this.light.direction[0] = -this.dir[0]; this.light.direction[1] = -this.dir[1]; this.light.direction[2] = -this.dir[2];
    this.light.color = pack(this.sun[0] * fade, this.sun[1] * fade, this.sun[2] * fade);
    // what the sun does not light: the sky's light, a little stronger by night so the city reads
    scene.ambient = pack(this.sky[0] * 0.75, this.sky[1] * 0.75, this.sky[2] * 0.75);
    scene.background = pack(this.horizon[0], this.horizon[1], this.horizon[2]);
    if (this.useDome) {
      this.dome.setPosition(eye[0], eye[1], eye[2]);
      if (Math.abs(hour - this.builtAt) > 0.04) { this.build(radius); this.builtAt = hour; }
    }
  }

  /** The dome: rings of vertices from below the horizon up, one overhead, coloured as sky.rs's dome_color. */
  private build(radius: number): void {
    const pos: number[] = [], col: u32[] = [], idx: i32[] = [];
    const glow = saturate(this.sunDir[1] * 6 + 0.6);
    const vertex = (x: number, y: number, z: number): void => {
      pos.push(x * radius); pos.push(y * radius); pos.push(z * radius);
      const upk = Math.sqrt(saturate(y)), down = saturate(-y * 3);
      const s = saturate(x * this.sunDir[0] + y * this.sunDir[1] + z * this.sunDir[2]);
      const s2 = s * s, s4 = s2 * s2, s8 = s4 * s4, s16 = s8 * s8, s64 = s16 * s16 * s16 * s16;
      const sun = (s8 * 0.18 + s64 * 0.35) * (1 - down);
      const c = (k: i32, around: number): number => (this.horizon[k] + (this.zenith[k] - this.horizon[k]) * upk) * (1 - 0.3 * down) + around * glow * sun;
      col.push(pack(c(0, 0.6 + this.sun[0]), c(1, 0.45 + this.sun[1]), c(2, 0.3 + this.sun[2])));
    };
    for (let r = 0; r < DOME_RINGS.length; r++) {
      const y = DOME_RINGS[r], rr = Math.sqrt(1 - y * y);
      for (let k = 0; k < DOME_SEGMENTS; k++) { const a = k * 2 * Math.PI / DOME_SEGMENTS; vertex(Math.cos(a) * rr, y, Math.sin(a) * rr); }
    }
    vertex(0, 1, 0);
    const n = DOME_SEGMENTS;
    for (let ring = 0; ring < DOME_RINGS.length - 1; ring++) {
      for (let k = 0; k < n; k++) {
        const a = ring * n + k, b = ring * n + (k + 1) % n, c = (ring + 1) * n + k, d = (ring + 1) * n + (k + 1) % n;
        idx.push(a); idx.push(c); idx.push(b); idx.push(b); idx.push(c); idx.push(d);
      }
    }
    const top = (DOME_RINGS.length - 1) * n;
    for (let k = 0; k < n; k++) { idx.push(top + k); idx.push(top + n); idx.push(top + (k + 1) % n); }
    const old = this.dome.mesh;
    this.dome.mesh = new Mesh(pos, idx, [], [], col);
    if (old !== null) old.dispose();
  }
}
