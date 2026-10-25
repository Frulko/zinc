// zinc:3d: software 3D on every target that runs the 2D rasterizer. Scene graph, camera and math live here (Zinc);
// transform, lighting, clipping and rasterization run in C++ (native/render3d.host.cpp) into a runtime image that
// render() draws as an ordinary image command (nearest-neighbour when scaled), so 2D UI composes over it. Matrices are flat column-major number[16].
// Guide: docs/plugins/3d.md.
import R from './native/render3d.spec';
import { readText, readBytes } from 'zinc:assets';
import { pixelScale, image } from 'zinc:gfx';
import { utf8Decode } from 'zinc:sys';

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
function set3(a: number[], x: number, y: number, z: number): void { a[0] = x; a[1] = y; a[2] = z; }
export function vec3Dot(a: number[], b: number[]): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
export function vec3Cross(a: number[], b: number[]): number[] { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
export function vec3Normalize(a: number[]): number[] {
  const l = Math.sqrt(vec3Dot(a, a));
  return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
}
/** Quaternion from Euler angles in radians (applied X, then Y, then Z), written into `out`. */
export function quatFromEuler(x: number, y: number, z: number, out: number[]): number[] {
  const cx = Math.cos(x / 2), sx = Math.sin(x / 2), cy = Math.cos(y / 2), sy = Math.sin(y / 2), cz = Math.cos(z / 2), sz = Math.sin(z / 2);
  out[0] = sx * cy * cz - cx * sy * sz; out[1] = cx * sy * cz + sx * cy * sz; out[2] = cx * cy * sz - sx * sy * cz; out[3] = cx * cy * cz + sx * sy * sz;
  return out;
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
  /** normals: empty = smooth normals computed from the faces; uvs and colors (0xRRGGBB) may be empty. `zmesh`: instead of the arrays, the
   *  part of a .zmesh file that starts at byte `at` (loadModel), taken as it is. */
  constructor(positions: number[], indices: i32[], normals: number[], uvs: number[], colors: u32[], zmesh: u8[] = [], at: i32 = 0, opened: boolean = false) {
    const part = zmesh.length > 0 || opened;   // opened: the part is in the model the renderer read (Bytes below)
    const h = opened ? R.assetMesh(at) : part ? R.meshLoad(zmesh, at) : R.meshCreate(positions, normals, uvs, colors, indices);
    if (h < 0) throw new RangeError(part ? `zinc:3d: the .zmesh part at byte ${at} is damaged` : 'zinc:3d: a mesh needs 1..65535 vertices');
    this.handle = h;
    this.vertices = opened ? assetWord(at) : part ? le32(zmesh, at) : positions.length / 3;
    this.triangles = opened ? assetWord(at + 4) / 3 : part ? le32(zmesh, at + 4) / 3 : indices.length / 3;
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

/** Wavefront OBJ: v (optionally followed by r g b in 0..1), vt, vn, f (polygons are fanned, negative indices ok).
 *  Files whose faces are plain `f a b c` use the `v` list as is; `v/t/n` references make one vertex per distinct
 *  reference (through a string map: more memory, avoid on ESP32). */
export function parseObj(text: string): Mesh {
  const vp: number[] = [], vt: number[] = [], vn: number[] = [], vc: u32[] = [];
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], col: u32[] = [], idx: i32[] = [];
  const seen = new Map<string, i32>();
  let hasUv = false, hasNrm = false, hasCol = false, direct = true, faces = false;
  let start: i32 = 0;
  while (start < text.length) {
    let end = text.indexOf('\n', start);
    if (end < 0) end = text.length;
    const w = text.slice(start, end).trim().replaceAll('\t', ' ').split(' ').filter((s: string) => s.length > 0);
    start = end + 1;
    if (w.length < 2) continue;
    const k = w[0];
    if (k === 'v') {
      for (let i = 1; i <= 3; i++) vp.push(parseFloat(w[i]));
      hasCol = hasCol || w.length >= 7;
      vc.push(w.length >= 7 ? rgb(parseFloat(w[4]), parseFloat(w[5]), parseFloat(w[6])) : 0xffffff);
    } else if (k === 'vt') { vt.push(parseFloat(w[1])); vt.push(1 - parseFloat(w[2])); }
    else if (k === 'vn') { for (let i = 1; i <= 3; i++) vn.push(parseFloat(w[i])); }
    else if (k === 'f') {
      if (!faces) { faces = true; direct = w[1].indexOf('/') < 0; }
      const face: i32[] = [];
      for (let i = 1; i < w.length; i++) {
        const p = w[i].split('/');
        const vi = objIndex(p[0], vp.length / 3);
        if (direct) { face.push(vi); continue; }
        // ponytail: has() + get(), `get() === undefined` is not supported for number values
        if (seen.has(w[i])) { face.push(seen.get(w[i]) ?? 0); continue; }
        const ti = p.length > 1 ? objIndex(p[1], vt.length / 2) : -1, ni = p.length > 2 ? objIndex(p[2], vn.length / 3) : -1;
        const id: i32 = pos.length / 3;
        for (let a = 0; a < 3; a++) pos.push(vp[vi * 3 + a]);
        col.push(vc[vi]);
        if (ti >= 0) { hasUv = true; uv.push(vt[ti * 2]); uv.push(vt[ti * 2 + 1]); } else { uv.push(0); uv.push(0); }
        if (ni >= 0) { hasNrm = true; for (let a = 0; a < 3; a++) nrm.push(vn[ni * 3 + a]); } else { nrm.push(0); nrm.push(0); nrm.push(0); }
        seen.set(w[i], id);
        face.push(id);
      }
      for (let i = 1; i + 1 < face.length; i++) { idx.push(face[0]); idx.push(face[i]); idx.push(face[i + 1]); }
    }
  }
  if (direct) return new Mesh(vp, idx, [], [], hasCol ? vc : []);
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
export const enum Filter { Default = 0, Nearest = 1, Linear = 2, Mipmap = 3 }
/** How a material meets what is behind it (ZN-696): opaque, over it with its `opacity`, or added to it (glows, light pools, sparks). */
export const enum Blend { Opaque = 0, Alpha = 1, Add = 2 }

export class Material {
  /** Base colour; multiplies the texture and the vertex colours' lighting. */
  color: u32 = 0xffffff;
  /** Image from gfx.image (baked asset) or gfx.createImage (runtime), -1 = none. Repeats outside 0..1. */
  texture: i32 = -1;
  /** How the GPU samples the texture (ZN-657): Filter.Default follows the renderer's `filter` option (mipmaps unless zinc.json says
   *  otherwise). The software renderer always takes the nearest texel. */
  filter: Filter = Filter.Default;
  vertexColors = false;
  shading: Shading = Shading.Smooth;
  doubleSided = false;
  /** Colour of the highlights (Blinn-Phong), 0 = none; `shininess` is the exponent (higher: smaller, sharper highlights). */
  specular: u32 = 0;
  shininess = 30;
  /** Light the material gives by itself, 0xRRGGBB (0 = none): added to the light it receives, before its texture (ZN-696). */
  emissive: u32 = 0;
  /** Blend.Alpha or Blend.Add draw it after the opaque nodes, over or onto what is behind it, scaled by `opacity` (0..1); it does not hide
   *  what comes after it. */
  blend: Blend = Blend.Opaque;
  opacity = 1;
  /** false: the scene's fog leaves it alone (a sky, a readout in the scene), as three.js's material.fog. The software renderer fogs it anyway. */
  fog = true;
  constructor(color: u32) { this.color = color; }
}

// The specular and emissive state last sent to the renderer: begin() resets them to none, so they are sent only when they change.
let specColor: u32 = 0, specShin = 30, emitColor: u32 = 0;
// The blended nodes of the frame being drawn (ZN-696): drawn after the opaque ones, in scene order.
const blended: Node[] = [];
// Counts the world matrices made: a node's stamp names the one it holds, so a child knows whether its parent's moved since it made its own.
let stamps: i32 = 0;

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
  /** The position, rotation and scale the world matrix was made from, the parent's stamp then, and this world's own stamp: a node that
   *  has not moved under a parent that has not either keeps its matrix (ten comparisons instead of a native call with five arrays). */
  private readonly made: number[] = [NaN, NaN, NaN, NaN, NaN, NaN, NaN, NaN, NaN, NaN];
  private seen: i32 = -1;
  private stamp: i32 = 0;

  constructor(mesh: Mesh | null, material: Material | null) { this.mesh = mesh; this.material = material; }
  add(child: Node): Node { this.children.push(child); return child; }
  setPosition(x: number, y: number, z: number): Node { set3(this.position, x, y, z); return this; }
  /** Euler angles in radians (X, then Y, then Z). */
  setRotation(x: number, y: number, z: number): Node { quatFromEuler(x, y, z, this.rotation); return this; }
  setScale(x: number, y: number, z: number): Node { set3(this.scale, x, y, z); return this; }

  /** Updates world matrices and issues draw calls for this subtree. */
  draw(parent: number[], parentStamp: i32 = 0): void {
    if (!this.visible) return;
    const p = this.position, q = this.rotation, s = this.scale, k = this.made;
    if (this.seen !== parentStamp || p[0] !== k[0] || p[1] !== k[1] || p[2] !== k[2] || q[0] !== k[3] || q[1] !== k[4] || q[2] !== k[5] ||
        q[3] !== k[6] || s[0] !== k[7] || s[1] !== k[8] || s[2] !== k[9]) {
      R.transform(this.world, parent, p, q, s);
      k[0] = p[0]; k[1] = p[1]; k[2] = p[2]; k[3] = q[0]; k[4] = q[1]; k[5] = q[2]; k[6] = q[3]; k[7] = s[0]; k[8] = s[1]; k[9] = s[2];
      this.seen = parentStamp;
      stamps++;
      this.stamp = stamps;
    }
    const mat = this.material;
    if (this.mesh !== null && mat !== null) { if (mat.blend === Blend.Opaque) this.drawMesh(); else blended.push(this); }
    for (const c of this.children) c.draw(this.world, this.stamp);
  }
  /** Draws this node's mesh at its world matrix (draw() computed it). */
  drawMesh(): void {
    const m = this.mesh, mat = this.material;
    if (m === null || mat === null) return;
    const flags = materialFlags(mat);
    if (mat.specular !== specColor || (specColor !== 0 && mat.shininess !== specShin)) {
      specColor = mat.specular; specShin = mat.shininess;
      R.specular(specColor, specShin);
    }
    if (mat.emissive !== emitColor) { emitColor = mat.emissive; R.emissive(emitColor); }
    R.draw(m.handle, this.world, mat.color, mat.texture, flags);
  }
}

/** A material's draw flags (render3d.spec.ts draw). */
function materialFlags(mat: Material): i32 {
  let flags: i32 = (mat.vertexColors ? 1 : 0) | (mat.shading === Shading.Flat ? 2 : 0) | (mat.shading === Shading.Unlit ? 4 : 0) | (mat.doubleSided ? 8 : 0) | ((mat.filter as i32) << 4) | (mat.fog ? 0 : 1 << 16);
  if (mat.blend !== Blend.Opaque) flags |= ((mat.blend as i32) << 6) | (Math.round(Math.min(1, Math.max(0, mat.opacity)) * 255) << 8);
  return flags;
}

/** A static world (include/zn/zworld.h: a city, a terrain, a level), as Pocket Tokyo draws its city: cells on the ground with up to three
 *  levels of detail (0 the finest), each level held by a chunk, a file loaded and freed as one, whose batches are a few large meshes with
 *  their indices grouped by cell and by the compass sector a wall faces. select() culls the cells against the camera's frustum, gives each
 *  the level of its distance (the reaches scaled down to keep the triangle budget, coarser only past the reach times the hysteresis, a
 *  coarser or finer loaded level while the one wanted is not loaded: no holes), keeps of its walls the sectors that can face the eye, and
 *  names the chunks to load (each cell's coarsest level first, then the nearest) and those nobody has wanted for `idle` seconds; the node
 *  then draws those index ranges, sorted by kind and batch. All of it runs in the renderer (native/render3d.host.cpp). The node's own
 *  position is ignored: the world's coordinates are the scene's. */
export class World extends Node {
  readonly handle: i32;
  /** Metres where the near level hands over to the mid level, and the mid to the far, when the budget allows them in full. */
  nearReach = 300;
  midReach = 1300;
  /** Triangles a frame may draw (0: no limit): over it the reaches come in by 3% a call, under 88% of it they go out by 0.8% (down to 1/4). */
  budget: i32 = 100000;
  hysteresis = 1.15;
  /** Leave out the walls that face away from the eye: fewer triangles, more draws. */
  sectors = true;
  /** Seconds a loaded chunk nobody wants waits before select names it to free (0: never). */
  idle = 0;
  /** After select(): the triangles and draws of what is shown, the reaches' scale (reachScale), the chunks to load (load()) and the ones to free (free()). */
  triangles: i32 = 0;
  draws: i32 = 0;
  reachScale = 1;
  readonly missing: i32[] = [];
  readonly unused: i32[] = [];
  private readonly out: i32[] = [];
  private readonly prm: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  private readonly eyes: number[] = [];

  constructor(asset: string) {
    super(null, null);
    this.handle = R.worldOpen(asset);
    if (this.handle < 0) throw new Error(`zinc:3d: ${asset} is not a world (include/zn/zworld.h)`);
  }
  /** Loads a chunk: the bytes read, -1 when it cannot. */
  load(chunk: i32): i32 { return R.worldLoad(this.handle, chunk); }
  free(chunk: i32): void { R.worldFree(this.handle, chunk); }
  /** The batches' night pictures and glow on or off. */
  setNight(on: boolean): void { R.worldNight(this.handle, on); }

  /** Chooses what the next render() of `camera` draws, its picture `aspect` wide for one high, and the chunks to load for the eye and for
   *  `ahead` (x, y, z of points it will pass, possibly none). `dt`: seconds since the last call. */
  select(camera: Camera, aspect: number, ahead: number[], dt: number): void {
    mat4LookAt(camera.view, camera.position, camera.target, camera.up);
    const e = this.eyes;
    e.length = 0;
    e.push(camera.position[0]); e.push(camera.position[1]); e.push(camera.position[2]);
    for (const v of ahead) e.push(v);
    const p = this.prm;
    p[0] = camera.fov * Math.PI / 180; p[1] = aspect; p[2] = camera.near; p[3] = camera.far; p[4] = this.nearReach; p[5] = this.midReach;
    p[6] = this.budget; p[7] = this.hysteresis; p[8] = this.sectors ? 1 : 0; p[9] = dt; p[10] = this.idle;
    const o = this.out;
    R.worldSelect(this.handle, camera.view, e, p, o);
    if (o.length < 5) return;
    this.triangles = o[0]; this.draws = o[1]; this.reachScale = o[2] / 1000;
    const n = o[3], m = o[4];
    this.missing.length = 0; this.unused.length = 0;
    for (let k = 0; k < n; k++) this.missing.push(o[5 + k]);
    for (let k = 0; k < m; k++) this.unused.push(o[5 + n + k]);
  }

  draw(_parent: number[], _parentStamp: i32 = 0): void {
    if (!this.visible) return;
    R.worldDraw(this.handle);
    specColor = 0; emitColor = 0;   // what worldDraw left the renderer with
  }
}

/** Linear fog, as three.js's Fog: nothing at view depth `near` and closer, all `color` (0xRRGGBB) at `far` and beyond. Set the scene's
 *  background to the same colour and the far edge of the world fades into it. */
export class Fog {
  color: u32;
  near: number;
  far: number;
  constructor(color: u32, near: number, far: number) { this.color = color; this.near = near; this.far = far; }
}

export class Scene extends Node {
  background: u32 = 0x000000;
  ambient: u32 = 0x333333;
  lights: Light[] = [];
  /** null: no fog. */
  fog: Fog | null = null;
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
  /** Pixels rendered per logical pixel (ZN-657): 0 (the default) is the window's pixel scale on the GPU (sharp on a Retina screen) and 1
   *  in software, which would pay four times the pixels. */
  pixelRatio = 0;
  readonly view: number[] = mat4();
  private rt: i32 = -1;

  lookAt(x: number, y: number, z: number): Camera { set3(this.target, x, y, z); return this; }
  setPosition(x: number, y: number, z: number): Camera { set3(this.position, x, y, z); return this; }
  /** The render target (colour image + z-buffer) is sized by the last render() box; free it when done. */
  dispose(): void { if (this.rt >= 0) R.targetDestroy(this.rt); this.rt = -1; }

  /** Renders `scene` seen by this camera into the screen box (x, y, w, h); returns the triangles rasterized. */
  render(scene: Scene, x: number, y: number, w: number, h: number): i32 {
    const k = this.pixelRatio > 0 ? this.pixelRatio : R.gpu() ? pixelScale() : 1;
    this.rt = R.target(this.rt, Math.round(w * k), Math.round(h * k));
    if (this.rt < 0) return 0;
    mat4LookAt(this.view, this.position, this.target, this.up);
    R.begin(this.rt, scene.background, this.view, this.ortho ? this.height : this.fov * Math.PI / 180, this.near, this.far, this.ortho);
    R.ambient(scene.ambient);
    const fog = scene.fog;
    if (fog !== null) R.fog(fog.color, fog.near, fog.far);
    specColor = 0; emitColor = 0;
    for (const l of scene.lights) R.light(l.direction[0], l.direction[1], l.direction[2], l.color);
    blended.length = 0;
    scene.draw(IDENTITY);
    for (const n of blended) n.drawMesh();   // after the opaque nodes, in scene order
    blended.length = 0;
    const tris = R.end();
    R.present(this.rt, x, y, w, h);
    return tris;
  }
}

const IDENTITY = mat4();

/** Whether a GPU draws the scenes (false: the software renderer). */
export function gpu(): boolean { return R.gpu(); }

/** Renders `scene` seen by `camera` into the screen box (x, y, w, h). Returns the triangles rasterized. */
export function render(scene: Scene, camera: Camera, x: number, y: number, w: number, h: number): i32 {
  return camera.render(scene, x, y, w, h);
}

function le32(d: u8[], at: i32): i32 { return d[at] | (d[at + 1] << 8) | (d[at + 2] << 16) | (d[at + 3] << 24); }
function assetWord(at: i32): i32 { return R.assetByte(at) | (R.assetByte(at + 1) << 8) | (R.assetByte(at + 2) << 16) | (R.assetByte(at + 3) << 24); }

/** The bytes of a model file: read by the renderer in one go (R.assetOpen), or through readBytes, one host call a byte, where it cannot. The
 *  parts' arrays then go to the renderer from its own copy: a console's interpreter never touches them. */
class Bytes {
  readonly length: i32;
  readonly native: boolean;
  private readonly d: u8[];
  constructor(asset: string) {
    const n = R.assetOpen(asset);
    this.native = n >= 0;
    this.d = this.native ? [] : readBytes(asset);
    this.length = this.native ? n : this.d.length;
  }
  at(i: i32): i32 { return this.native ? R.assetByte(i) : (this.d[i] as i32); }
  word(i: i32): i32 { return this.at(i) | (this.at(i + 1) << 8) | (this.at(i + 2) << 16) | (this.at(i + 3) << 24); }
  text(i: i32, n: i32): string { const b: u8[] = []; for (let k = 0; k < n; k++) b.push(this.at(i + k) as u8); return utf8Decode(b); }
  mesh(at: i32): Mesh { return this.native ? new Mesh([], [], [], [], [], [], at, true) : new Mesh([], [], [], [], [], this.d, at); }
  close(): void { if (this.native) R.assetClose(); }
}

/** A .zmesh model from the assets (ZN-441: the model importer's `format: "zmesh"`, include/zn/zmesh.h): a node whose children are its parts,
 *  their arrays handed to the renderer as they are (no parsing step), their materials (base colour and opacity, texture, double-sided, unlit,
 *  blending, flat without normals) and textures (images of the packs, beside the model). The scene was flattened at build time. */
export function loadModel(asset: string): Node {
  const d = new Bytes(asset);
  if (d.length < 16 || d.at(0) !== 0x5a || d.at(1) !== 0x4d || d.at(2) !== 0x53 || d.at(3) !== 0x31) { d.close(); throw new Error(`zinc:3d: ${asset} is not a .zmesh file`); }
  let slash = asset.length - 1;
  while (slash >= 0 && asset.at(slash) !== '/') slash--;
  const textures: i32[] = [];
  let at: i32 = 16;
  for (let i = 0; i < d.word(8); i++) {
    const n = d.word(at);
    const id = image(asset.slice(0, slash + 1) + d.text(at + 4, n));
    if (id < 0) console.warn(`zinc:3d: ${asset}: texture ${i} not found in the assets`);
    textures.push(id);
    at += 4 + ((n + 3) & ~3);
  }
  const root = new Node(null, null);
  for (let p = 0; p < d.word(4); p++) {
    const nv = d.word(at), ni = d.word(at + 4), flags = d.word(at + 8), color = d.word(at + 12), tex = d.word(at + 16);
    const mat = new Material((color & 0xffffff) as u32);
    if (tex >= 0 && tex < textures.length) mat.texture = textures[tex];
    mat.doubleSided = (flags & 4) !== 0;
    mat.shading = (flags & 8) !== 0 ? Shading.Unlit : (flags & 16) !== 0 ? Shading.Flat : Shading.Smooth;
    mat.vertexColors = (flags & 2) !== 0;
    if ((flags & 32) !== 0) { mat.blend = Blend.Alpha; mat.opacity = ((color >> 24) & 255) / 255; }
    root.add(new Node(d.mesh(at), mat));
    at += 24 + nv * (24 + ((flags & 1) !== 0 ? 8 : 0) + ((flags & 2) !== 0 ? 4 : 0)) + ((ni * 2 + 3) & ~3);   // zmesh.h partBytes
  }
  d.close();
  return root;
}
