// GLTFLoader for three (Zinc): glTF 2.0 .gltf (JSON + .bin + images) and .glb files from the embedded assets or
// the file system. Meshes (triangles, strips, fans; POSITION, NORMAL, TEXCOORD_0, COLOR_0; u8/u16/u32 indices),
// node hierarchy (TRS or matrix), materials (baseColorFactor, baseColorTexture, doubleSided, KHR_materials_unlit),
// PNG/JPEG textures: image files in the assets are baked at build time, embedded images are decoded at run time.
// Not supported (ignored, counted in the result): animations, skins, morph targets, cameras, sparse accessors, Draco.
import {
  Group, Object3D, Mesh, BufferGeometry, Float32BufferAttribute, Material, MeshStandardMaterial, MeshBasicMaterial,
  Texture, DoubleSide, Matrix4, Camera, readFile, decodeUri,
} from '../index';
import { image as bakedImage } from 'zinc:gfx';
import T from '../native/three.spec';

export class AnimationClip { name = ''; }
export class GLTFAsset { version = '2.0'; generator = ''; }
export class GLTF {
  scene: Group = new Group();
  readonly scenes: Group[] = [];
  /** Always empty: animations are not supported (see `ignoredAnimations`). */
  readonly animations: AnimationClip[] = [];
  readonly cameras: Camera[] = [];
  readonly asset = new GLTFAsset();
  ignoredAnimations: i32 = 0;
  ignoredSkins: i32 = 0;
  meshes: i32 = 0;
  triangles: i32 = 0;
}

export class GLTFLoader {
  path = '';
  setPath(p: string): GLTFLoader { this.path = p; return this; }
  /** Loads and parses `url` (synchronously: onLoad runs before load returns). Without onError, failures throw. */
  load(url: string, onLoad: (gltf: GLTF) => void, onProgress: ((loaded: number) => void) | null = null, onError: ((e: Error) => void) | null = null): void {
    const file = this.path + url;
    const data = readFile(file);
    if (data.length === 0) { fail(onError, `GLTFLoader: cannot read ${file}`); return; }
    let slash = file.length - 1;
    while (slash >= 0 && file.at(slash) !== '/') slash--;
    this.parse(data, file.slice(0, slash + 1), onLoad, onError);
  }
  loadAsync(url: string): Promise<GLTF> {
    return new Promise<GLTF>((resolve: (g: GLTF) => void, reject: (e: Error) => void) => {
      this.load(url, (g: GLTF) => resolve(g), null, (e: Error) => reject(e));
    });
  }
  /** Parses .gltf or .glb bytes; relative URIs (buffers, images) resolve against `path`. */
  parse(data: u8[], path: string, onLoad: (gltf: GLTF) => void, onError: ((e: Error) => void) | null = null): void {
    const h = T.parse(data);
    if (h < 0) { fail(onError, `GLTFLoader: ${T.error()}`); return; }
    const b = new Builder(h, path);
    const err = b.loadBuffers();
    if (err.length > 0) { T.free(h); fail(onError, err); return; }
    const g = b.build();
    T.free(h);
    onLoad(g);
  }
}

function fail(onError: ((e: Error) => void) | null, msg: string): void {
  if (onError !== null) onError(new Error(msg)); else throw new Error(msg);
}

class Primitive { geometry: BufferGeometry; material: i32; constructor(g: BufferGeometry, m: i32) { this.geometry = g; this.material = m; } }

class Builder {
  h: i32; base: string;
  textures = new Map<i32, Texture>();
  images = new Map<i32, i32>();
  materials: Material[] = [];
  defaultMaterial: Material | null = null;
  meshes = new Map<i32, Primitive[]>();
  result = new GLTF();
  constructor(h: i32, base: string) { this.h = h; this.base = base; }

  loadBuffers(): string {
    for (let i = 0; i < T.bufferCount(this.h); i++) {
      const uri = T.bufferUri(this.h, i);
      if (uri.length === 0) continue;
      const bytes = readFile(this.base + decodeUri(uri));
      if (bytes.length === 0) return `GLTFLoader: cannot read buffer ${this.base}${uri}`;
      T.setBuffer(this.h, i, bytes);
    }
    return '';
  }

  build(): GLTF {
    const h = this.h, g = this.result;
    g.asset.generator = T.assetInfo(h);
    g.ignoredAnimations = T.animationCount(h);
    g.ignoredSkins = T.skinCount(h);
    for (let m = 0; m < T.materialCount(h); m++) this.materials.push(this.material(m));
    for (let s = 0; s < T.sceneCount(h); s++) {
      const scene = new Group();
      scene.name = T.sceneName(h, s);
      const roots: i32[] = [];
      T.sceneNodes(h, s, roots);
      for (const n of roots) scene.add(this.node(n, 0));
      g.scenes.push(scene);
    }
    const d = T.defaultScene(h);
    if (d >= 0 && d < g.scenes.length) g.scene = g.scenes[d];
    else if (g.scenes.length > 0) g.scene = g.scenes[0];
    return g;
  }

  private image(i: i32): i32 {
    if (this.images.has(i)) return this.images.get(i) ?? -1;
    let id: i32 = -1;
    const uri = T.imageUri(this.h, i);
    if (uri.length === 0) id = T.imageDecode(this.h, i);
    else {
      const name = this.base + decodeUri(uri);
      id = bakedImage(name);  // PNG in the assets: baked at build time
      if (id < 0) { const bytes = readFile(name); if (bytes.length > 0) id = T.decode(bytes); }
    }
    if (id < 0) console.warn(`GLTFLoader: image ${i} not loaded (${T.error()})`);
    this.images.set(i, id);
    return id;
  }
  private texture(t: i32): Texture | null {
    if (this.textures.has(t)) return this.textures.get(t) ?? null;
    const src = T.textureSource(this.h, t);
    const img = src >= 0 ? this.image(src) : -1;
    if (img < 0) return null;
    const tex = new Texture(img);
    tex.flipY = false;
    this.textures.set(t, tex);
    return tex;
  }
  private material(m: i32): Material {
    const flags = T.materialFlags(this.h, m);
    let mat: Material = new MeshStandardMaterial();
    if ((flags & 2) !== 0) mat = new MeshBasicMaterial();
    mat.name = T.materialName(this.h, m);
    const c: number[] = [];
    T.materialColor(this.h, m, c);
    mat.color.setRGB(c[0], c[1], c[2]);
    mat.opacity = c[3];
    mat.transparent = (flags & 4) !== 0;
    if ((flags & 1) !== 0) mat.side = DoubleSide;
    const t = T.materialTexture(this.h, m);
    if (t >= 0) mat.map = this.texture(t);
    return mat;
  }
  private primitives(mesh: i32): Primitive[] {
    const cached = this.meshes.get(mesh);
    if (cached !== undefined) return cached;
    const out: Primitive[] = [];
    for (let p = 0; p < T.primitiveCount(this.h, mesh); p++) {
      const pos: number[] = [], nrm: number[] = [], uv: number[] = [], col: number[] = [], idx: i32[] = [];
      const mat = T.primitive(this.h, mesh, p, pos, nrm, uv, col, idx);
      if (mat < -1) { console.warn(`GLTFLoader: ${T.error()}`); continue; }
      const geo = new BufferGeometry();
      geo.name = T.meshName(this.h, mesh);
      geo.uvTopLeft = true;
      geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
      if (nrm.length > 0) geo.setAttribute('normal', new Float32BufferAttribute(nrm, 3));
      if (uv.length > 0) geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
      if (col.length > 0) geo.setAttribute('color', new Float32BufferAttribute(col, 3));
      const ix: number[] = [];
      for (const v of idx) ix.push(v);
      geo.setIndex(ix);
      out.push(new Primitive(geo, mat));
      this.result.meshes++;
      this.result.triangles += idx.length / 3;
    }
    this.meshes.set(mesh, out);
    return out;
  }
  private materialOf(i: i32, vertexColors: boolean): Material {
    if (i >= 0 && i < this.materials.length) {
      const m = this.materials[i];
      if (vertexColors && !m.vertexColors) { const c = m.clone(); c.vertexColors = true; return c; }
      return m;
    }
    let d = this.defaultMaterial;
    if (d === null) { d = new MeshStandardMaterial({ color: 0xffffff }); this.defaultMaterial = d; }
    return d;
  }
  private meshObject(p: Primitive, name: string): Mesh {
    const m = new Mesh(p.geometry, this.materialOf(p.material, p.geometry.attributes.color.count > 0));
    m.name = name;
    return m;
  }
  private node(n: i32, depth: i32): Object3D {
    const h = this.h, name = T.nodeName(h, n), mesh = T.nodeMesh(h, n);
    let obj: Object3D;
    const prims: Primitive[] = mesh >= 0 ? this.primitives(mesh) : [];
    if (prims.length === 1) obj = this.meshObject(prims[0], name);
    else {
      obj = new Group();
      obj.name = name;
      const mname = mesh >= 0 ? T.meshName(h, mesh) : '';
      for (let i = 0; i < prims.length; i++) obj.add(this.meshObject(prims[i], `${mname.length > 0 ? mname : name}_${i}`));
    }
    const t: number[] = [];
    T.nodeTransform(h, n, t);
    if (t.length === 16) obj.applyMatrix4(new Matrix4().fromArray(t));
    else if (t.length === 10) {
      obj.position.set(t[0], t[1], t[2]);
      obj.quaternion.set(t[3], t[4], t[5], t[6]);
      obj.scale.set(t[7], t[8], t[9]);
      obj.syncRotation();
    }
    const kids: i32[] = [];
    T.nodeChildren(h, n, kids);
    if (depth < 64) for (const k of kids) obj.add(this.node(k, depth + 1));  // glTF node graphs are trees
    return obj;
  }
}
