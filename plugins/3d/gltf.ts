// glTF 2.0 and GLB models for zinc:3d (ZN-658): `import { loadGltf } from 'zinc:3d/gltf'`. A module of its own so that only the programs
// that import it link the reader: the three plugin's native glTF reader (decisions D25, D72), not a second one. Loads the default scene's node
// hierarchy (TRS or matrix), meshes (triangles, strips, fans; positions, normals, uvs, vertex colours; any number of vertices, split in
// meshes of 65535), base colour and its texture, double-sided and unlit materials. Skins, animations and unsupported extensions are named
// in a warning; a file that requires an unsupported extension is an error (the reader refuses it).
import { Node, Mesh, Material, Shading, rgb, mat4, mat4Compose, mat4Multiply } from 'zinc:3d';
import { image as bakedImage } from 'zinc:gfx';
import { exists, readBytes } from 'zinc:assets';
import T from '../three/native/three.spec';
import { gltfShininess } from '../three/gltf-material';

/** The extensions loadGltf reads. */
const SUPPORTED = ['KHR_materials_specular', 'KHR_materials_unlit', 'KHR_texture_transform', 'KHR_mesh_quantization', 'EXT_meshopt_compression', 'KHR_meshopt_compression'];
const MAX_VERTICES: i32 = 65535;
const MAX_GEOMETRY_VALUES: i32 = 1048576; // At most 8 MiB of numeric payload for an explicitly requested CPU copy.

/** A .gltf or .glb file from the embedded assets (or the file system): a node whose children are the default scene's roots. */
export function loadGltf(asset: string): Node {
  const b = open(asset);
  try { return b.scene(); } finally { T.free(b.h); }
}

/** CPU triangles in the default scene's coordinate system, including node transforms and instances.
 *  Requested explicitly for tools such as surface picking; ordinary loadGltf/Mesh objects retain no CPU copy. */
export class GltfGeometry {
  positions: number[] = [];
  indices: i32[] = [];
}
export function loadGltfGeometry(asset: string): GltfGeometry {
  const b = open(asset);
  try { return b.geometry(); } finally { T.free(b.h); }
}

function open(asset: string): Builder {
  const data = readFile(asset);
  if (data.length === 0) throw new Error(`zinc:3d: cannot read ${asset}`);
  const h = T.parse(data);
  if (h < 0) throw new Error(`zinc:3d: ${asset}: ${T.error()}`);
  let slash = asset.length - 1;
  while (slash >= 0 && asset.at(slash) !== '/') slash--;
  const b = new Builder(h, asset, asset.slice(0, slash + 1));
  try {
    b.check();
    for (let i = 0; i < T.bufferCount(h); i++) {
      const uri = T.bufferUri(h, i);
      if (uri.length === 0) continue;
      const bytes = readFile(b.base + decodeUri(uri));
      if (bytes.length === 0) throw new Error(`zinc:3d: ${asset}: cannot read buffer ${b.base}${uri}`);
      T.setBuffer(h, i, bytes);
    }
    return b;
  } catch (error) { T.free(h); throw error; }
}

function readFile(path: string): u8[] {
  if (exists(path)) return readBytes(path);
  const out: u8[] = [];
  T.readFile(path, out);
  return out;
}
/** %XX escapes of a relative URI. ponytail: ASCII only, a percent-encoded UTF-8 name stays encoded (three's decodeUri has the full one). */
function decodeUri(s: string): string {
  if (!s.includes('%')) return s;
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = i + 2 < s.length && s.at(i) === '%' ? parseInt(s.slice(i + 1, i + 3), 16) : -1;
    if (c > 0 && c < 128) { out += String.fromCharCode(c); i += 2; } else out += s.at(i);
  }
  return out;
}

class Part { mesh: Mesh; material: Material; constructor(m: Mesh, mat: Material) { this.mesh = m; this.material = mat; } }

class Builder {
  h: i32; asset: string; base: string;
  images = new Map<i32, i32>();
  materials = new Map<string, Material>();
  meshes = new Map<i32, Part[]>();
  constructor(h: i32, asset: string, base: string) { this.h = h; this.asset = asset; this.base = base; }

  /** Names what is not read in a warning. */
  check(): void {
    const ignored = T.extensions(this.h).split(',').filter((e: string) => e.length > 0 && !SUPPORTED.includes(e));
    const skins = T.skinCount(this.h), anims = T.animationCount(this.h);
    if (skins > 0) ignored.unshift(`skins (${skins})`);
    if (anims > 0) ignored.unshift(`animations (${anims})`);
    if (ignored.length > 0) console.warn(`zinc:3d: ${this.asset}: not supported, ignored: ${ignored.join(', ')}`);
  }

  private roots(): i32[] {
    let scene = T.defaultScene(this.h);
    if (scene < 0 || scene >= T.sceneCount(this.h)) scene = 0;
    const roots: i32[] = [];
    if (scene < T.sceneCount(this.h)) T.sceneNodes(this.h, scene, roots);
    return roots;
  }

  scene(): Node {
    const root = new Node(null, null);
    for (const n of this.roots()) root.add(this.node(n, 0));
    return root;
  }

  geometry(): GltfGeometry {
    const out = new GltfGeometry();
    for (const n of this.roots()) this.geometryNode(n, mat4(), out);
    return out;
  }

  private geometryNode(n: i32, parent: number[], out: GltfGeometry): void {
    const t: number[] = [];
    T.nodeTransform(this.h, n, t);
    const local = t.length === 16 ? t : mat4Compose(mat4(), t.slice(0, 3), t.slice(3, 7), t.slice(7, 10));
    const world = mat4Multiply(mat4(), parent, local), mesh = T.nodeMesh(this.h, n);
    if (mesh >= 0) for (let p = 0; p < T.primitiveCount(this.h, mesh); p++) {
      const size: i32[] = [], available: i32 = MAX_GEOMETRY_VALUES - out.positions.length - out.indices.length;
      if (!T.primitiveSize(this.h, mesh, p, size) || size.length !== 2) throw new Error(`zinc:3d: ${this.asset}: ${T.error()}`);
      if (size[0] > available || size[1] > available - size[0]) throw new Error(`zinc:3d: ${this.asset}: CPU geometry exceeds 8 MiB`);
      const pos: number[] = [], normals: number[] = [], uv: number[] = [], colors: number[] = [], indices: i32[] = [];
      const material = T.primitive(this.h, mesh, p, pos, normals, uv, colors, indices);
      if (material < -1) throw new Error(`zinc:3d: ${this.asset}: ${T.error()}`);
      if (pos.length > size[0] || indices.length > size[1] || pos.length % 3 !== 0 || indices.length % 3 !== 0) throw new Error(`zinc:3d: ${this.asset}: incomplete triangle geometry`);
      if (pos.length > MAX_GEOMETRY_VALUES - out.positions.length - out.indices.length || indices.length > MAX_GEOMETRY_VALUES - out.positions.length - out.indices.length - pos.length) throw new Error(`zinc:3d: ${this.asset}: CPU geometry exceeds 8 MiB`);
      const first: i32 = out.positions.length / 3;
      for (let i = 0; i + 2 < pos.length; i += 3) {
        const x = pos[i], y = pos[i + 1], z = pos[i + 2];
        for (let r = 0; r < 3; r++) {
          const value = world[r] * x + world[4 + r] * y + world[8 + r] * z + world[12 + r];
          if (!Number.isFinite(value)) throw new Error(`zinc:3d: ${this.asset}: nonfinite geometry`);
          out.positions.push(value);
        }
      }
      for (const index of indices) {
        if (index < 0 || index >= pos.length / 3) throw new Error(`zinc:3d: ${this.asset}: invalid geometry index`);
        out.indices.push(first + index);
      }
    }
    const kids: i32[] = [];
    T.nodeChildren(this.h, n, kids);
    for (const child of kids) this.geometryNode(child, world, out);
  }

  private image(i: i32): i32 {
    if (this.images.has(i)) return this.images.get(i) ?? -1;
    let id: i32 = -1;
    const uri = T.imageUri(this.h, i);
    if (uri.length === 0) id = T.imageDecode(this.h, i);
    else {
      const name = this.base + decodeUri(uri);
      id = bakedImage(name);  // an image file in the assets: baked at build time
      if (id < 0) { const bytes = readFile(name); if (bytes.length > 0) id = T.decode(bytes); }
    }
    if (id < 0) console.warn(`zinc:3d: ${this.asset}: image ${i} not loaded (${T.error()})`);
    this.images.set(i, id);
    return id;
  }

  /** Material `m` (-1: the default one), with vertex colours or flat normals when the primitive asks for them. */
  private material(m: i32, vertexColors: boolean, flat: boolean): Material {
    const key = `${m}:${vertexColors}:${flat}`;
    const known = this.materials.get(key);
    if (known !== undefined) return known;
    const mat = new Material(0xffffff);
    if (m >= 0) {
      const c: number[] = [];
      T.materialColor(this.h, m, c);
      mat.color = rgb(c[0], c[1], c[2]);
      const flags = T.materialFlags(this.h, m);
      mat.doubleSided = (flags & 1) !== 0;
      if ((flags & 2) !== 0) mat.shading = Shading.Unlit;
      const spec: number[] = [];
      if (T.materialSpecular(this.h, m, spec)) { mat.specular = rgb(spec[0], spec[1], spec[2]); mat.shininess = gltfShininess(spec[3]); }
      const t = T.materialTexture(this.h, m), src = t >= 0 ? T.textureSource(this.h, t) : -1;
      if (src >= 0) mat.texture = this.image(src);
    }
    mat.vertexColors = vertexColors;
    if (flat && mat.shading !== Shading.Unlit) mat.shading = Shading.Flat;  // glTF: no normals means flat normals
    this.materials.set(key, mat);
    return mat;
  }

  private parts(mesh: i32): Part[] {
    const cached = this.meshes.get(mesh);
    if (cached !== undefined) return cached;
    const out: Part[] = [];
    for (let p = 0; p < T.primitiveCount(this.h, mesh); p++) {
      const pos: number[] = [], nrm: number[] = [], uv: number[] = [], col: number[] = [], idx: i32[] = [];
      const m = T.primitive(this.h, mesh, p, pos, nrm, uv, col, idx);
      if (m < -1) { console.warn(`zinc:3d: ${this.asset}: ${T.error()}`); continue; }
      const colors: u32[] = [];
      for (let i = 0; i + 2 < col.length; i += 3) colors.push(rgb(col[i], col[i + 1], col[i + 2]));
      const mat = this.material(m, colors.length > 0, nrm.length === 0);
      for (const piece of split(pos, nrm, uv, colors, idx)) out.push(new Part(piece, mat));
    }
    this.meshes.set(mesh, out);
    return out;
  }

  private node(n: i32, depth: i32): Node {
    const mesh = T.nodeMesh(this.h, n);
    const parts: Part[] = mesh >= 0 ? this.parts(mesh) : [];
    const obj = parts.length === 1 ? new Node(parts[0].mesh, parts[0].material) : new Node(null, null);
    if (parts.length > 1) for (const p of parts) obj.add(new Node(p.mesh, p.material));
    const t: number[] = [];
    T.nodeTransform(this.h, n, t);
    if (t.length === 10) {
      for (let i = 0; i < 3; i++) { obj.position[i] = t[i]; obj.scale[i] = t[7 + i]; }
      for (let i = 0; i < 4; i++) obj.rotation[i] = t[3 + i];
    } else if (t.length === 16) decompose(t, obj);
    const kids: i32[] = [];
    T.nodeChildren(this.h, n, kids);
    if (depth < 64) for (const k of kids) obj.add(this.node(k, depth + 1));  // glTF node graphs are trees
    return obj;
  }
}

/** One mesh, or several of at most 65535 vertices each (a vertex shared by two of them is copied). */
function split(pos: number[], nrm: number[], uv: number[], col: u32[], idx: i32[]): Mesh[] {
  const n: i32 = pos.length / 3;
  if (n <= MAX_VERTICES) return [new Mesh(pos, idx, nrm, uv, col)];
  const owner: i32[] = [], at: i32[] = [];
  for (let v = 0; v < n; v++) { owner.push(-1); at.push(0); }
  const out: Mesh[] = [];
  let t: i32 = 0;
  while (t < idx.length) {
    const chunk: i32 = out.length;
    const p: number[] = [], q: number[] = [], u: number[] = [], c: u32[] = [], ix: i32[] = [];
    let count: i32 = 0;
    while (t < idx.length && count + 3 <= MAX_VERTICES) {
      for (let k = 0; k < 3; k++) {
        const v = idx[t + k];
        if (owner[v] !== chunk) {
          owner[v] = chunk; at[v] = count++;
          for (let a = 0; a < 3; a++) p.push(pos[v * 3 + a]);
          if (nrm.length > 0) for (let a = 0; a < 3; a++) q.push(nrm[v * 3 + a]);
          if (uv.length > 0) { u.push(uv[v * 2]); u.push(uv[v * 2 + 1]); }
          if (col.length > 0) c.push(col[v]);
        }
        ix.push(at[v]);
      }
      t += 3;
    }
    out.push(new Mesh(p, ix, q, u, c));
  }
  return out;
}

/** A column-major TRS matrix into the node's position, rotation (quaternion) and scale. */
function decompose(m: number[], node: Node): void {
  const len = (i: i32): number => Math.sqrt(m[i] * m[i] + m[i + 1] * m[i + 1] + m[i + 2] * m[i + 2]);
  let sx = len(0);
  const sy = len(4), sz = len(8);
  const det = m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]);
  if (det < 0) sx = -sx;
  node.position[0] = m[12]; node.position[1] = m[13]; node.position[2] = m[14];
  node.scale[0] = sx; node.scale[1] = sy; node.scale[2] = sz;
  // the rotation's rows r_ij = m[j * 4 + i] / s_j
  const r00 = m[0] / sx, r10 = m[1] / sx, r20 = m[2] / sx, r01 = m[4] / sy, r11 = m[5] / sy, r21 = m[6] / sy, r02 = m[8] / sz, r12 = m[9] / sz, r22 = m[10] / sz;
  const q = node.rotation, tr = r00 + r11 + r22;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    q[3] = 0.25 / s; q[0] = (r21 - r12) * s; q[1] = (r02 - r20) * s; q[2] = (r10 - r01) * s;
  } else if (r00 > r11 && r00 > r22) {
    const s = 2 * Math.sqrt(1 + r00 - r11 - r22);
    q[3] = (r21 - r12) / s; q[0] = 0.25 * s; q[1] = (r01 + r10) / s; q[2] = (r02 + r20) / s;
  } else if (r11 > r22) {
    const s = 2 * Math.sqrt(1 + r11 - r00 - r22);
    q[3] = (r02 - r20) / s; q[0] = (r01 + r10) / s; q[1] = 0.25 * s; q[2] = (r12 + r21) / s;
  } else {
    const s = 2 * Math.sqrt(1 + r22 - r00 - r11);
    q[3] = (r10 - r01) / s; q[0] = (r02 + r20) / s; q[1] = (r12 + r21) / s; q[2] = 0.25 * s;
  }
}
