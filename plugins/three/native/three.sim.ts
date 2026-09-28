// three for the sim target: the same glTF reader in JavaScript (JSON.parse, DataView). Images are not decoded:
// decode() reads the PNG/JPEG header and returns a runtime image of that size (the sim draws nothing).
import { createImage } from 'zinc:gfx';
import * as fs from 'node:fs';

interface Doc { j: any; bufs: (Uint8Array | null)[] }
const docs: (Doc | null)[] = [];
let err = '';
const doc = (h: number): Doc | null => docs[h] ?? null;
const str = (v: unknown): string => typeof v === 'string' ? v : '';
const u8 = (a: number[]): Uint8Array => Uint8Array.from(a);

function dataUri(s: string): Uint8Array | null {
  if (!s.startsWith('data:')) return null;
  const c = s.indexOf(',');
  return c < 0 ? null : new Uint8Array(Buffer.from(s.slice(c + 1).replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
}
function parse(data: number[]): number {
  let slot = 0;
  while (slot < docs.length && docs[slot]) slot++;
  if (slot >= 16) { err = 'too many open glTF documents'; return -1; }
  const b = u8(data), dv = new DataView(b.buffer);
  let text = '', bin: Uint8Array | null = null;
  if (b.length >= 20 && String.fromCharCode(b[0], b[1], b[2], b[3]) === 'glTF') {
    if (dv.getUint32(4, true) !== 2) { err = `glb version ${dv.getUint32(4, true)} is not supported`; return -1; }
    const total = Math.min(dv.getUint32(8, true), b.length);
    let off = 12, found = false;
    while (off + 8 <= total) {
      const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
      if (off + 8 + len > total) break;
      if (type === 0x4E4F534A && !found) { text = Buffer.from(b.subarray(off + 8, off + 8 + len)).toString('utf8'); found = true; }
      else if (type === 0x004E4942 && !bin) bin = b.subarray(off + 8, off + 8 + len);
      off += 8 + ((len + 3) & ~3);
    }
    if (!found) { err = 'glb without a JSON chunk'; return -1; }
  } else text = Buffer.from(b).toString('utf8');
  let j: any;
  try { j = JSON.parse(text.replace(/^﻿/, '')); } catch { err = 'invalid glTF JSON'; return -1; }
  if (!j || typeof j !== 'object' || !str(j.asset?.version).startsWith('2')) { err = 'not a glTF 2.0 document'; return -1; }
  for (const e of j.extensionsRequired ?? []) {
    if (e !== 'KHR_materials_unlit' && e !== 'KHR_texture_transform') { err = `required extension ${e} is not supported`; return -1; }
  }
  const bufs = (j.buffers ?? []).map((x: any) => x.uri === undefined ? bin : dataUri(str(x.uri)));
  docs[slot] = { j, bufs };
  return slot;
}
const list = (d: Doc, k: string): any[] => Array.isArray(d.j[k]) ? d.j[k] : [];
const item = (d: Doc, k: string, i: number): any => list(d, k)[i];
const COMPS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
const csize = (ct: number) => ct === 5120 || ct === 5121 ? 1 : ct === 5122 || ct === 5123 ? 2 : 4;
interface Acc { dv: DataView; off: number; count: number; comps: number; ct: number; stride: number; norm: boolean }
function accessor(d: Doc, a: number): Acc | null {
  const o = item(d, 'accessors', a);
  if (!o) return null;
  const v = item(d, 'bufferViews', o.bufferView ?? -1), comps = COMPS[o.type] ?? 0;
  if (!v || !comps) return null;
  const buf = d.bufs[v.buffer ?? -1];
  if (!buf) return null;
  const ct = o.componentType ?? 5126, elem = csize(ct) * comps, stride = v.byteStride > 0 ? v.byteStride : elem;
  const off = (v.byteOffset ?? 0) + (o.byteOffset ?? 0), count = o.count ?? 0;
  if (count > 0 && off + (count - 1) * stride + elem > buf.length) return null;
  return { dv: new DataView(buf.buffer, buf.byteOffset, buf.length), off, count, comps, ct, stride, norm: !!o.normalized };
}
function read(a: Acc, i: number, c: number): number {
  const p = a.off + i * a.stride + c * csize(a.ct);
  switch (a.ct) {
    case 5126: return a.dv.getFloat32(p, true);
    case 5121: { const v = a.dv.getUint8(p); return a.norm ? v / 255 : v; }
    case 5120: { const v = a.dv.getInt8(p); return a.norm ? Math.max(-1, v / 127) : v; }
    case 5123: { const v = a.dv.getUint16(p, true); return a.norm ? v / 65535 : v; }
    case 5122: { const v = a.dv.getInt16(p, true); return a.norm ? Math.max(-1, v / 32767) : v; }
    case 5125: return a.dv.getUint32(p, true);
  }
  return 0;
}
function pushAttr(d: Doc, a: number | undefined, want: number, count: number, out: number[]): void {
  const x = a === undefined ? null : accessor(d, a);
  if (!x || x.count < count) return;
  for (let i = 0; i < count; i++) for (let c = 0; c < want; c++) out.push(c < x.comps ? read(x, i, c) : 0);
}
/** Image size from the PNG IHDR or the JPEG SOFn marker. */
function imageSize(b: Uint8Array): [number, number] | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.length);
  if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50) return [dv.getUint32(16), dv.getUint32(20)];
  if (b.length < 4 || b[0] !== 0xFF || b[1] !== 0xD8) return null;
  let p = 2;
  while (p + 9 < b.length) {
    if (b[p] !== 0xFF) { p++; continue; }
    const m = b[p + 1];
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return [dv.getUint16(p + 7), dv.getUint16(p + 5)];
    if (m === 0xD8 || (m >= 0xD0 && m <= 0xD7) || m === 0x01 || m === 0xFF) { p += m === 0xFF ? 1 : 2; continue; }
    p += 2 + dv.getUint16(p + 2);
  }
  return null;
}
function decodeBytes(b: Uint8Array): number {
  const s = imageSize(b);
  if (!s) { err = 'image: unknown image type'; return -1; }
  return createImage(s[0], s[1]);
}

export default {
  parse,
  error: (): string => err,
  free(h: number): void { if (doc(h)) docs[h] = null; },
  assetInfo: (h: number): string => str(doc(h)?.j.asset?.generator),
  bufferCount: (h: number): number => doc(h)?.bufs.length ?? 0,
  bufferUri(h: number, i: number): string { const d = doc(h); return d && !d.bufs[i] ? str(item(d, 'buffers', i)?.uri) : ''; },
  setBuffer(h: number, i: number, data: number[]): void { const d = doc(h); if (d && i >= 0 && i < d.bufs.length) d.bufs[i] = u8(data); },
  imageCount: (h: number): number => { const d = doc(h); return d ? list(d, 'images').length : 0; },
  imageUri(h: number, i: number): string { const d = doc(h); const u = d ? str(item(d, 'images', i)?.uri) : ''; return u.startsWith('data:') ? '' : u; },
  imageDecode(h: number, i: number): number {
    const d = doc(h);
    if (!d) return -1;
    const im = item(d, 'images', i);
    if (im?.uri !== undefined) { const b = dataUri(str(im.uri)); if (!b) { err = `image ${i} is an external file`; return -1; } return decodeBytes(b); }
    const v = item(d, 'bufferViews', im?.bufferView ?? -1), buf = v ? d.bufs[v.buffer ?? -1] : null;
    if (!v || !buf) { err = `image ${i} has no data`; return -1; }
    return decodeBytes(buf.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + (v.byteLength ?? 0)));
  },
  textureSource: (h: number, t: number): number => { const d = doc(h); return d ? item(d, 'textures', t)?.source ?? -1 : -1; },
  sceneCount: (h: number): number => { const d = doc(h); return d ? list(d, 'scenes').length : 0; },
  defaultScene: (h: number): number => doc(h)?.j.scene ?? 0,
  sceneName: (h: number, s: number): string => { const d = doc(h); return d ? str(item(d, 'scenes', s)?.name) : ''; },
  sceneNodes(h: number, s: number, out: number[]): void { const d = doc(h); for (const n of (d ? item(d, 'scenes', s)?.nodes : null) ?? []) out.push(n); },
  nodeCount: (h: number): number => { const d = doc(h); return d ? list(d, 'nodes').length : 0; },
  nodeName: (h: number, n: number): string => { const d = doc(h); return d ? str(item(d, 'nodes', n)?.name) : ''; },
  nodeMesh: (h: number, n: number): number => { const d = doc(h); return d ? item(d, 'nodes', n)?.mesh ?? -1 : -1; },
  nodeChildren(h: number, n: number, out: number[]): void { const d = doc(h); for (const c of (d ? item(d, 'nodes', n)?.children : null) ?? []) out.push(c); },
  nodeTransform(h: number, n: number, out: number[]): void {
    const d = doc(h);
    const o = d ? item(d, 'nodes', n) : null;
    if (!o) return;
    if (Array.isArray(o.matrix) && o.matrix.length === 16) { for (const v of o.matrix) out.push(v); return; }
    const def = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1];
    let k = 0;
    for (const [key, cnt] of [['translation', 3], ['rotation', 4], ['scale', 3]] as [string, number][]) {
      for (let i = 0; i < cnt; i++, k++) { const v = o[key]?.[i]; out.push(typeof v === 'number' ? v : def[k]); }
    }
  },
  meshCount: (h: number): number => { const d = doc(h); return d ? list(d, 'meshes').length : 0; },
  meshName: (h: number, m: number): string => { const d = doc(h); return d ? str(item(d, 'meshes', m)?.name) : ''; },
  primitiveCount: (h: number, m: number): number => { const d = doc(h); return d ? (item(d, 'meshes', m)?.primitives ?? []).length : 0; },
  primitive(h: number, m: number, p: number, pos: number[], nrm: number[], uv: number[], col: number[], idx: number[]): number {
    const d = doc(h);
    if (!d) return -2;
    const pr = item(d, 'meshes', m)?.primitives?.[p], at = pr?.attributes ?? {};
    const mode = pr?.mode ?? 4;
    if (mode < 4 || mode > 6) { err = `mesh ${m} primitive ${p}: mode ${mode} (points or lines) is not supported`; return -2; }
    if (pr?.extensions?.KHR_draco_mesh_compression) { err = 'Draco compressed meshes are not supported'; return -2; }
    const pa = accessor(d, at.POSITION ?? -1);
    if (!pa) { err = `mesh ${m} primitive ${p}: no readable POSITION`; return -2; }
    const n = pa.count;
    pushAttr(d, at.POSITION, 3, n, pos);
    pushAttr(d, at.NORMAL, 3, n, nrm);
    pushAttr(d, at.TEXCOORD_0, 2, n, uv);
    pushAttr(d, at.COLOR_0, 3, n, col);
    const ix: number[] = [];
    const ia = pr.indices === undefined ? null : accessor(d, pr.indices);
    if (ia) for (let i = 0; i < ia.count; i++) ix.push(read(ia, i, 0));
    else for (let i = 0; i < n; i++) ix.push(i);
    let tris = 0;
    for (let i = 0; i + 2 < ix.length; i += mode === 4 ? 3 : 1) {
      let a = ix[i], b = ix[i + 1], c = ix[i + 2];
      if (mode === 5 && (i & 1)) [a, b] = [b, a];
      if (mode === 6) { a = ix[0]; b = ix[i + 1]; c = ix[i + 2]; }
      if (a < 0 || b < 0 || c < 0 || a >= n || b >= n || c >= n) continue;
      idx.push(a, b, c); tris++;
    }
    return tris ? pr.material ?? -1 : -2;
  },
  materialCount: (h: number): number => { const d = doc(h); return d ? list(d, 'materials').length : 0; },
  materialName: (h: number, m: number): string => { const d = doc(h); return d ? str(item(d, 'materials', m)?.name) : ''; },
  materialColor(h: number, m: number, out: number[]): void {
    const d = doc(h);
    const f = d ? item(d, 'materials', m)?.pbrMetallicRoughness?.baseColorFactor : null;
    for (let i = 0; i < 4; i++) out.push(typeof f?.[i] === 'number' ? f[i] : 1);
  },
  materialTexture: (h: number, m: number): number => { const d = doc(h); return d ? item(d, 'materials', m)?.pbrMetallicRoughness?.baseColorTexture?.index ?? -1 : -1; },
  materialFlags(h: number, m: number): number {
    const d = doc(h);
    const o = d ? item(d, 'materials', m) : null;
    if (!o) return 0;
    return (o.doubleSided ? 1 : 0) | (o.extensions?.KHR_materials_unlit ? 2 : 0) | (o.alphaMode === 'BLEND' ? 4 : 0) | (o.alphaMode === 'MASK' ? 8 : 0);
  },
  animationCount: (h: number): number => { const d = doc(h); return d ? list(d, 'animations').length : 0; },
  skinCount: (h: number): number => { const d = doc(h); return d ? list(d, 'skins').length : 0; },
  decode: (data: number[]): number => decodeBytes(u8(data)),
  readFile(path: string, out: number[]): boolean {
    try { for (const v of fs.readFileSync(path)) out.push(v); return true; } catch { return false; }
  },
  pixelRatio: (): number => 1,
};
