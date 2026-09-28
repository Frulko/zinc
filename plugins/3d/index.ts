// zinc:3d: software 3D on every target that runs the 2D rasterizer. Scene graph, camera and math live here (Zinc);
// transform, lighting, clipping and rasterization run in C++ (native/render3d.host.cpp) into a runtime image that
// render() draws with gfx.drawImage, so 2D UI composes over it. Matrices are flat column-major number[16].
// Guide: docs/plugins/3d.md.
import R from './native/render3d.spec';
import { drawImage } from 'zinc:gfx';
import { readText } from 'zinc:assets';

// ---------------------------------------------------------------- math (flat arrays)
export function mat4(): number[] { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
/** out = a * b (out may alias neither). */
export function mat4Multiply(out: number[], a: number[], b: number[]): number[] {
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}
/** Translation * rotation (quaternion x, y, z, w) * scale. */
export function mat4Compose(out: number[], p: number[], q: number[], s: number[]): number[] {
  const x = q[0], y = q[1], z = q[2], w = q[3];
  out[0] = (1 - 2 * (y * y + z * z)) * s[0]; out[1] = 2 * (x * y + z * w) * s[0]; out[2] = 2 * (x * z - y * w) * s[0]; out[3] = 0;
  out[4] = 2 * (x * y - z * w) * s[1]; out[5] = (1 - 2 * (x * x + z * z)) * s[1]; out[6] = 2 * (y * z + x * w) * s[1]; out[7] = 0;
  out[8] = 2 * (x * z + y * w) * s[2]; out[9] = 2 * (y * z - x * w) * s[2]; out[10] = (1 - 2 * (x * x + y * y)) * s[2]; out[11] = 0;
  out[12] = p[0]; out[13] = p[1]; out[14] = p[2]; out[15] = 1;
  return out;
}
/** View matrix of an eye looking at a target. */
export function mat4LookAt(out: number[], eye: number[], target: number[], up: number[]): number[] {
  const f = vec3Normalize([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);  // camera looks down -z
  const s = vec3Normalize(vec3Cross(up, f));
  const u = vec3Cross(f, s);
  out[0] = s[0]; out[1] = u[0]; out[2] = f[0]; out[3] = 0;
  out[4] = s[1]; out[5] = u[1]; out[6] = f[1]; out[7] = 0;
  out[8] = s[2]; out[9] = u[2]; out[10] = f[2]; out[11] = 0;
  out[12] = -vec3Dot(s, eye); out[13] = -vec3Dot(u, eye); out[14] = -vec3Dot(f, eye); out[15] = 1;
  return out;
}
export function vec3Dot(a: number[], b: number[]): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
export function vec3Cross(a: number[], b: number[]): number[] { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
export function vec3Normalize(a: number[]): number[] {
  const l = Math.sqrt(vec3Dot(a, a));
  return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
}
/** Quaternion from Euler angles in radians (applied X, then Y, then Z). */
export function quatFromEuler(x: number, y: number, z: number): number[] {
  const cx = Math.cos(x / 2), sx = Math.sin(x / 2), cy = Math.cos(y / 2), sy = Math.sin(y / 2), cz = Math.cos(z / 2), sz = Math.sin(z / 2);
  return [sx * cy * cz - cx * sy * sz, cx * sy * cz + sx * cy * sz, cx * cy * sz - sx * sy * cz, cx * cy * cz + sx * sy * sz];
}
export function quatFromAxisAngle(ax: number, ay: number, az: number, angle: number): number[] {
  const n = vec3Normalize([ax, ay, az]), s = Math.sin(angle / 2);
  return [n[0] * s, n[1] * s, n[2] * s, Math.cos(angle / 2)];
}
/** a * b: rotation b, then a. */
export function quatMultiply(a: number[], b: number[]): number[] {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

// ---------------------------------------------------------------- meshes
/** Indexed triangles in C++ memory. Front faces are counter-clockwise; uv origin is the image's top-left. */
export class Mesh {
  readonly handle: i32;
  readonly vertices: i32;
  readonly triangles: i32;
  /** normals: empty = smooth normals computed from the faces; uvs and colors (0xRRGGBB) may be empty. */
  constructor(positions: number[], indices: i32[], normals: number[], uvs: number[], colors: u32[]) {
    this.handle = R.meshCreate(positions, normals, uvs, colors, indices);
    if (this.handle < 0) throw new RangeError('zinc:3d: a mesh needs 1..65535 vertices');
    this.vertices = positions.length / 3;
    this.triangles = indices.length / 3;
  }
  dispose(): void { R.meshDestroy(this.handle); }
}

/** Axis-aligned cube centred on the origin, one texture per face. */
export function cube(size: number): Mesh {
  const h = size / 2;
  // per face: normal, then the u and v axes (right and down on the face)
  const f: number[] = [0, 0, 1, 1, 0, 0, 0, -1, 0, 0, 0, -1, -1, 0, 0, 0, -1, 0, 1, 0, 0, 0, 0, -1, 0, -1, 0,
    -1, 0, 0, 0, 0, 1, 0, -1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, -1, 0, 1, 0, 0, 0, 0, -1];
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: i32[] = [];
  for (let i = 0; i < 6; i++) {
    const n = i * 9, b = i * 4;
    for (let k = 0; k < 4; k++) {
      const u = k === 1 || k === 2 ? 1 : 0, v = k >= 2 ? 1 : 0;
      for (let a = 0; a < 3; a++) {
        pos.push((f[n + a] + (u * 2 - 1) * f[n + 3 + a] + (v * 2 - 1) * f[n + 6 + a]) * h);
        nrm.push(f[n + a]);
      }
      uv.push(u); uv.push(v);
    }
    idx.push(b); idx.push(b + 2); idx.push(b + 1); idx.push(b); idx.push(b + 3); idx.push(b + 2);
  }
  return new Mesh(pos, idx, nrm, uv, []);
}

/** UV sphere: `segments` around, `rings` from pole to pole. */
export function sphere(radius: number, segments: i32, rings: i32): Mesh {
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: i32[] = [];
  for (let r = 0; r <= rings; r++) {
    const phi = Math.PI * r / rings, y = Math.cos(phi), sr = Math.sin(phi);
    for (let s = 0; s <= segments; s++) {
      const th = 2 * Math.PI * s / segments, x = sr * Math.sin(th), z = sr * Math.cos(th);
      pos.push(x * radius); pos.push(y * radius); pos.push(z * radius);
      nrm.push(x); nrm.push(y); nrm.push(z);
      uv.push(s / segments); uv.push(r / rings);
    }
  }
  grid(idx, segments, rings);
  return new Mesh(pos, idx, nrm, uv, []);
}

/** Plane in XZ facing +y, `sx` x `sz` cells; the texture repeats once per cell. */
export function plane(width: number, depth: number, sx: i32, sz: i32): Mesh {
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: i32[] = [];
  for (let j = 0; j <= sz; j++) {
    for (let i = 0; i <= sx; i++) {
      pos.push((i / sx - 0.5) * width); pos.push(0); pos.push((j / sz - 0.5) * depth);
      nrm.push(0); nrm.push(1); nrm.push(0);
      uv.push(i); uv.push(j);
    }
  }
  grid(idx, sx, sz);
  return new Mesh(pos, idx, nrm, uv, []);
}

/** Torus around the y axis: ring radius `major`, tube radius `minor`. */
export function torus(major: number, minor: number, segments: i32, sides: i32): Mesh {
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: i32[] = [];
  for (let j = 0; j <= sides; j++) {
    const b = 2 * Math.PI * j / sides, cb = Math.cos(b), sb = Math.sin(b);
    for (let i = 0; i <= segments; i++) {
      const a = 2 * Math.PI * i / segments, ca = Math.cos(a), sa = Math.sin(a);
      pos.push((major + minor * cb) * sa); pos.push(-minor * sb); pos.push((major + minor * cb) * ca);
      nrm.push(cb * sa); nrm.push(-sb); nrm.push(cb * ca);
      uv.push(i / segments); uv.push(j / sides);
    }
  }
  grid(idx, segments, sides);
  return new Mesh(pos, idx, nrm, uv, []);
}

/** Triangles of a (cols+1) x (rows+1) vertex grid, counter-clockwise seen from the normal side of the generators. */
function grid(idx: i32[], cols: i32, rows: i32): void {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a: i32 = r * (cols + 1) + c, b: i32 = a + cols + 1;
      idx.push(a); idx.push(b); idx.push(a + 1);
      idx.push(a + 1); idx.push(b); idx.push(b + 1);
    }
  }
}

/** Wavefront OBJ: v (optionally followed by r g b in 0..1), vt, vn, f (polygons are fanned, negative indices ok). */
export function parseObj(text: string): Mesh {
  const vp: number[] = [], vc: number[] = [], vt: number[] = [], vn: number[] = [];
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], col: u32[] = [], idx: i32[] = [];
  const seen = new Map<string, i32>();
  let hasUv = false, hasNrm = false, hasCol = false;
  for (const raw of text.split('\n')) {
    const w = raw.trim().replaceAll('\t', ' ').split(' ').filter((s: string) => s.length > 0);
    if (w.length < 2) continue;
    const k = w[0];
    if (k === 'v') {
      for (let i = 1; i <= 3; i++) vp.push(parseFloat(w[i]));
      hasCol = hasCol || w.length >= 7;
      for (let i = 4; i <= 6; i++) vc.push(w.length >= 7 ? parseFloat(w[i]) : 1);
    } else if (k === 'vt') { vt.push(parseFloat(w[1])); vt.push(1 - parseFloat(w[2])); }
    else if (k === 'vn') { for (let i = 1; i <= 3; i++) vn.push(parseFloat(w[i])); }
    else if (k === 'f') {
      const face: i32[] = [];
      for (let i = 1; i < w.length; i++) {
        let id = seen.get(w[i]);
        if (id === undefined) {
          const p = w[i].split('/');
          const vi = objIndex(p[0], vp.length / 3), ti = p.length > 1 ? objIndex(p[1], vt.length / 2) : -1, ni = p.length > 2 ? objIndex(p[2], vn.length / 3) : -1;
          id = pos.length / 3;
          for (let a = 0; a < 3; a++) pos.push(vp[vi * 3 + a]);
          col.push(rgb(vc[vi * 3], vc[vi * 3 + 1], vc[vi * 3 + 2]));
          if (ti >= 0) { hasUv = true; uv.push(vt[ti * 2]); uv.push(vt[ti * 2 + 1]); } else { uv.push(0); uv.push(0); }
          if (ni >= 0) { hasNrm = true; for (let a = 0; a < 3; a++) nrm.push(vn[ni * 3 + a]); } else { nrm.push(0); nrm.push(0); nrm.push(0); }
          seen.set(w[i], id);
        }
        face.push(id);
      }
      for (let i = 1; i + 1 < face.length; i++) { idx.push(face[0]); idx.push(face[i]); idx.push(face[i + 1]); }
    }
  }
  return new Mesh(pos, idx, hasNrm ? nrm : [], hasUv ? uv : [], hasCol ? col : []);
}
/** OBJ file from the embedded assets. */
export function loadObj(asset: string): Mesh { return parseObj(readText(asset)); }

function objIndex(s: string, count: number): i32 {
  if (s.length === 0) return -1;
  const i: i32 = parseInt(s, 10);
  return i < 0 ? count + i : i - 1;
}
/** 0xRRGGBB from components in 0..1. */
export function rgb(r: number, g: number, b: number): u32 {
  const c = (v: number): u32 => v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255);
  return (c(r) << 16) | (c(g) << 8) | c(b);
}

// ---------------------------------------------------------------- materials, lights, nodes
export const enum Shading { Smooth = 0, Flat = 1, Unlit = 2 }

export class Material {
  /** Base colour; multiplies the texture and the vertex colours' lighting. */
  color: u32 = 0xffffff;
  /** Image from gfx.image (baked asset) or gfx.createImage (runtime), -1 = none. Repeats outside 0..1. */
  texture: i32 = -1;
  vertexColors = false;
  shading: Shading = Shading.Smooth;
  doubleSided = false;
  constructor(color: u32) { this.color = color; }
}

/** Directional light: the direction light travels, in world space. */
export class Light {
  direction: number[];
  color: u32;
  constructor(dx: number, dy: number, dz: number, color: u32) { this.direction = [dx, dy, dz]; this.color = color; }
}

export class Node {
  position: number[] = [0, 0, 0];
  /** Quaternion x, y, z, w. */
  rotation: number[] = [0, 0, 0, 1];
  scale: number[] = [1, 1, 1];
  mesh: Mesh | null;
  material: Material | null;
  visible = true;
  readonly children: Node[] = [];
  /** World matrix, updated by render(). */
  readonly world: number[] = mat4();
  private local: number[] = mat4();

  constructor(mesh: Mesh | null, material: Material | null) { this.mesh = mesh; this.material = material; }
  add(child: Node): Node { this.children.push(child); return child; }
  setPosition(x: number, y: number, z: number): Node { this.position = [x, y, z]; return this; }
  /** Euler angles in radians (X, then Y, then Z). */
  setRotation(x: number, y: number, z: number): Node { this.rotation = quatFromEuler(x, y, z); return this; }
  setScale(x: number, y: number, z: number): Node { this.scale = [x, y, z]; return this; }

  /** Updates world matrices and issues draw calls for this subtree. */
  draw(parent: number[]): void {
    if (!this.visible) return;
    mat4Compose(this.local, this.position, this.rotation, this.scale);
    mat4Multiply(this.world, parent, this.local);
    const m = this.mesh, mat = this.material;
    if (m !== null && mat !== null) {
      const flags: i32 = (mat.vertexColors ? 1 : 0) | (mat.shading === Shading.Flat ? 2 : 0) | (mat.shading === Shading.Unlit ? 4 : 0) | (mat.doubleSided ? 8 : 0);
      R.draw(m.handle, this.world, mat.color, mat.texture, flags);
    }
    for (const c of this.children) c.draw(this.world);
  }
}

export class Scene extends Node {
  background: u32 = 0x000000;
  ambient: u32 = 0x333333;
  lights: Light[] = [];
  constructor() { super(null, null); }
}

export class Camera {
  position: number[] = [0, 0, 5];
  target: number[] = [0, 0, 0];
  up: number[] = [0, 1, 0];
  /** Vertical field of view in degrees (perspective). */
  fov = 60;
  near = 0.1;
  far = 100;
  /** Orthographic projection showing `height` world units vertically. */
  ortho = false;
  height = 10;
  readonly view: number[] = mat4();
  private rt: i32 = -1;

  lookAt(x: number, y: number, z: number): Camera { this.target = [x, y, z]; return this; }
  setPosition(x: number, y: number, z: number): Camera { this.position = [x, y, z]; return this; }
  /** The render target (colour image + z-buffer) is sized by the last render() box; free it when done. */
  dispose(): void { if (this.rt >= 0) R.targetDestroy(this.rt); this.rt = -1; }

  /** Internal: renders `scene` into this camera's target, returns the image id or -1. */
  frame(scene: Scene, w: i32, h: i32): i32 {
    this.rt = R.target(this.rt, w, h);
    if (this.rt < 0) return -1;
    mat4LookAt(this.view, this.position, this.target, this.up);
    R.begin(this.rt, scene.background, this.view, this.ortho ? this.height : this.fov * Math.PI / 180, this.near, this.far, this.ortho);
    R.ambient(scene.ambient);
    for (const l of scene.lights) R.light(l.direction[0], l.direction[1], l.direction[2], l.color);
    scene.draw(IDENTITY);
    lastTriangles = R.end();
    return R.image(this.rt);
  }
}

const IDENTITY = mat4();
let lastTriangles: i32 = 0;

/** Renders `scene` seen by `camera` into the screen box (x, y, w, h). Returns the triangles rasterized. */
export function render(scene: Scene, camera: Camera, x: number, y: number, w: number, h: number): i32 {
  const img = camera.frame(scene, Math.round(w), Math.round(h));
  if (img >= 0) drawImage(img, x, y, w, h, 255, 0);
  return lastTriangles;
}
