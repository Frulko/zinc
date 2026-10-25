// zinc:3d for the sim target: metadata only, no pixels. Meshes keep their triangle count, targets own a runtime
// image of the scaled size, end() returns the triangles submitted (no clipping or culling happens here). A World is
// selected as render3d.host.cpp does it (levels by distance, hysteresis, no holes, frustum, governor, the chunks to load
// and to free), so a program that streams one runs here too.
import { createImage, destroyImage } from 'zinc:gfx';
import { readBytes } from 'zinc:assets';

const meshes: i32[] = [];
interface T { img: i32; w: i32; h: i32 }
const targets: (T | null)[] = [];
let tris: i32 = 0;

// ---------------------------------------------------------------- worlds (include/zn/zworld.h)
class WCell {
  mn: number[] = [0, 0, 0];
  mx: number[] = [0, 0, 0];
  reach: number[] = [0, 0];
  chunk: i32[] = [-1, -1, -1];
  shown: i32 = -1;
  d = 0;
}
class WBatch { constructor(public cell: i32, public cells: i32, public groups: i32, public spans: i32[]) {} }
class WChunk {
  loaded = false;
  idle = 0;
  need = 0;
  batches: WBatch[] = [];
  constructor(public level: i32, public name: string) {}
}
class W {
  cells: WCell[] = [];
  chunks: WChunk[] = [];
  scale = 1;
  shown: i32 = 0;   // the triangles the last select chose (worldDraw adds them)
  constructor(public dir: string) {}
}
const worlds: (W | null)[] = [];
const NONE = 1e30, LATER = 1e7, ASK: i32 = 64, FREE: i32 = 16, POINTS: i32 = 8;

function u32(d: u8[], o: i32): number { return (d[o] | d[o + 1] << 8 | d[o + 2] << 16) + d[o + 3] * 16777216; }
function i32of(d: u8[], o: i32): i32 { return d[o] | d[o + 1] << 8 | d[o + 2] << 16 | d[o + 3] << 24; }
function f32(d: u8[], o: i32): number {
  const b = u32(d, o), e = Math.floor(b / 8388608) % 256, m = b % 8388608, s = b >= 2147483648 ? -1 : 1;
  if (e === 255) return m === 0 ? s * Infinity : NaN;
  return e === 0 ? s * m * Math.pow(2, -149) : s * (1 + m / 8388608) * Math.pow(2, e - 127);
}
function utf8(d: u8[], o: i32, n: i32): string { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(d[o + i]); return s; }
function bytesOf(name: string): u8[] { try { return readBytes(name); } catch (_e) { return []; } }
function world(id: i32): W | null { return id >= 0 && id < worlds.length ? worlds[id] : null; }
function boxDist(c: WCell, p: number[], at: i32): number {
  let s = 0;
  for (let a = 0; a < 3; a++) { const v = p[at + a], d = v < c.mn[a] ? c.mn[a] - v : v > c.mx[a] ? v - c.mx[a] : 0; s += d * d; }
  return Math.sqrt(s);
}
function wantOf(d: number, r: number[]): i32 { return d < r[0] ? 0 : d < r[1] ? 1 : 2; }

export default {
  meshCreate(pos: number[], _nrm: number[], _uv: number[], _col: u32[], idx: i32[]): i32 {
    const nv = Math.floor(pos.length / 3);
    if (nv <= 0 || nv > 65535) return -1;
    meshes.push(Math.floor(idx.length / 3));
    return meshes.length - 1;
  },
  meshLoad(data: u8[], at: i32): i32 {
    if (at < 0 || at + 24 > data.length) return -1;
    const nv = u32(data, at);
    if (nv <= 0 || nv > 65535) return -1;
    meshes.push(Math.floor(u32(data, at + 4) / 3));
    return meshes.length - 1;
  },
  meshDestroy(m: i32): void { if (m >= 0 && m < meshes.length) meshes[m] = 0; },
  meshDeform(m: i32, pos: number[], nrm: number[]): boolean { return m >= 0 && m < meshes.length && pos.length === nrm.length; },
  target(t: i32, w: i32, h: i32): i32 {
    w = Math.max(1, w); h = Math.max(1, h);
    const cur = t >= 0 && t < targets.length ? targets[t] : null;
    if (cur !== null && cur.w === w && cur.h === h) return t;
    if (cur !== null) destroyImage(cur.img);
    const nt: T = { img: createImage(w, h), w: w, h: h };
    if (cur !== null) { targets[t] = nt; return t; }
    targets.push(nt);
    return targets.length - 1;
  },
  targetDestroy(t: i32): void { const c = t >= 0 && t < targets.length ? targets[t] : null; if (c !== null) { destroyImage(c.img); targets[t] = null; } },
  begin(): void { tris = 0; },
  ambient(): void {},
  light(): void {},
  specular(): void {},
  emissive(): void {},
  fog(): void {},
  assetOpen(): i32 { return -1; },
  assetByte(): i32 { return 0; },
  assetMesh(): i32 { return -1; },
  assetClose(): void {},
  draw(m: i32): void { if (m >= 0 && m < meshes.length) tris += meshes[m]; },
  gpu(): boolean { return false; },
  transform(world: number[], parent: number[], p: number[], q: number[], s: number[]): void {
    const x = q[0], y = q[1], z = q[2], w = q[3];
    const L: number[] = [(1 - 2 * (y * y + z * z)) * s[0], 2 * (x * y + z * w) * s[0], 2 * (x * z - y * w) * s[0], 0,
      2 * (x * y - z * w) * s[1], (1 - 2 * (x * x + z * z)) * s[1], 2 * (y * z + x * w) * s[1], 0,
      2 * (x * z + y * w) * s[2], 2 * (y * z - x * w) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0, p[0], p[1], p[2], 1];
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) world[c * 4 + r] = parent[r] * L[c * 4] + parent[4 + r] * L[c * 4 + 1] + parent[8 + r] * L[c * 4 + 2] + parent[12 + r] * L[c * 4 + 3];
    }
  },
  end(): i32 { return tris; },
  present(): void {},

  worldOpen(name: string): i32 {
    const d = bytesOf(name);
    if (d.length < 16 || utf8(d, 0, 4) !== 'ZWD1' || u32(d, 4) !== 1) return -1;
    const nc = u32(d, 8), nk = u32(d, 12);
    if (16 + nc * 44 + nk * 8 > d.length) return -1;
    const slash = name.lastIndexOf('/');
    const w = new W(slash >= 0 ? name.slice(0, slash + 1) : '');
    let q: i32 = 16;
    for (let i = 0; i < nc; i++, q += 44) {
      const c = new WCell();
      for (let a = 0; a < 3; a++) { c.mn[a] = f32(d, q + 4 * a); c.mx[a] = f32(d, q + 12 + 4 * a); }
      c.reach[0] = f32(d, q + 24); c.reach[1] = f32(d, q + 28);
      for (let l = 0; l < 3; l++) c.chunk[l] = i32of(d, q + 32 + 4 * l);
      w.cells.push(c);
    }
    for (let k = 0; k < nk; k++) {
      if (q + 8 > d.length) return -1;
      const len = u32(d, q + 4);
      w.chunks.push(new WChunk(u32(d, q), utf8(d, q + 8, len)));
      q += 8 + Math.floor((len + 3) / 4) * 4;
    }
    worlds.push(w);
    return worlds.length - 1;
  },
  worldChunkCount(id: i32): i32 { const w = world(id); if (w === null) return 0; return w.chunks.length; },
  worldClose(id: i32): void { if (world(id) !== null) worlds[id] = null; },
  /** The chunk's batches and spans (its vertices and indices are not kept: the sim draws no pixels). */
  worldLoad(id: i32, k: i32): i32 {
    const w = world(id);
    if (w === null || k < 0 || k >= w.chunks.length) return -1;
    const ch = w.chunks[k];
    const d = bytesOf(w.dir + ch.name);
    if (d.length < 16 || utf8(d, 0, 4) !== 'ZWC1') return -1;
    const nb = u32(d, 4), ns = u32(d, 8), nn = u32(d, 12);
    let q: i32 = 16 + nb * 84;
    for (let i = 0; i < nn; i++) q += 4 + Math.floor((u32(d, q) + 3) / 4) * 4;
    if (q + ns * 4 > d.length) return -1;
    ch.batches.length = 0;
    for (let i = 0; i < nb; i++) {
      const r: i32 = 16 + i * 84, cells: i32 = u32(d, r + 32), groups: i32 = u32(d, r + 36), first: i32 = u32(d, r + 40);
      const spans: i32[] = [];
      for (let s = 0; s <= cells * groups; s++) spans.push(u32(d, q + (first + s) * 4));
      ch.batches.push(new WBatch(i32of(d, r + 28), cells, groups, spans));
    }
    ch.loaded = true; ch.idle = 0;
    return d.length;
  },
  worldFree(id: i32, k: i32): void {
    const w = world(id);
    if (w === null || k < 0 || k >= w.chunks.length) return;
    const ch = w.chunks[k];
    ch.loaded = false; ch.batches.length = 0;
  },
  worldNight(): void {},
  worldShadows(): void {},
  // ponytail: no sectors (a cell's walls all count) and no slots; render3d.host.cpp's selection otherwise
  worldSelect(id: i32, view: number[], eyes: number[], prm: number[], out: i32[]): void {
    const w = world(id);
    if (w === null || prm.length < 11 || eyes.length < 3 || view.length < 16) return;
    const nearR = prm[4] * w.scale, midR = prm[5] * w.scale, budget = prm[6], hyst = prm[7] > 1 ? prm[7] : 1, dt = prm[9], idleMax = prm[10];
    // the frustum's planes from projection x view (Gribb and Hartmann), inside >= 0
    const asp = prm[1] > 0 ? prm[1] : 1, n = prm[2], f = prm[3], kf = 1 / Math.tan(prm[0] * 0.5);
    const Pm: number[] = [kf / asp, 0, 0, 0, 0, kf, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0];
    const VP: number[] = [];
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) VP.push(Pm[r] * view[c * 4] + Pm[4 + r] * view[c * 4 + 1] + Pm[8 + r] * view[c * 4 + 2] + Pm[12 + r] * view[c * 4 + 3]);
    const pl: number[] = [];
    for (let i = 0; i < 3; i++) for (let sg = 0; sg < 2; sg++) for (let c = 0; c < 4; c++) pl.push(VP[c * 4 + 3] + (sg === 1 ? -1 : 1) * VP[c * 4 + i]);
    const inside = (c: WCell): boolean => {
      for (let i = 0; i < 6; i++) {
        const a = pl[i * 4], b = pl[i * 4 + 1], cc = pl[i * 4 + 2];
        if (a * (a >= 0 ? c.mx[0] : c.mn[0]) + b * (b >= 0 ? c.mx[1] : c.mn[1]) + cc * (cc >= 0 ? c.mx[2] : c.mn[2]) + pl[i * 4 + 3] < 0) return false;
      }
      return true;
    };
    const ne: i32 = Math.min(POINTS, Math.floor(eyes.length / 3));
    for (const c of w.cells) {
      c.d = boxDist(c, eyes, 0);
      if (!(c.mn[1] <= c.mx[1] && inside(c))) { c.shown = -1; continue; }
      const r: number[] = [c.reach[0] > 0 ? c.reach[0] : nearR, c.reach[1] > 0 ? c.reach[1] : midR];
      let want = wantOf(c.d, r);
      if (c.shown >= 0 && want > c.shown) { let l = c.shown; while (l < want && c.d >= r[l] * hyst) l++; want = l; }
      let lvl: i32 = -1;
      for (let l = want; l < 3 && lvl < 0; l++) if (c.chunk[l] >= 0 && w.chunks[c.chunk[l]].loaded) lvl = l;
      for (let l = want - 1; l >= 0 && lvl < 0; l--) if (c.chunk[l] >= 0 && w.chunks[c.chunk[l]].loaded) lvl = l;
      c.shown = lvl;
    }
    let shown: i32 = 0, draws: i32 = 0;
    for (let k = 0; k < w.chunks.length; k++) {
      const ch = w.chunks[k];
      if (!ch.loaded) continue;
      for (const b of ch.batches) {
        let any = false;
        for (let ci = 0; ci < b.cells; ci++) {
          const cell = b.cell + ci;
          if (cell < 0 || cell >= w.cells.length) continue;
          const c = w.cells[cell];
          if (c.shown !== ch.level || c.chunk[ch.level] !== k) continue;
          shown += Math.floor((b.spans[(ci + 1) * b.groups] - b.spans[ci * b.groups]) / 3);
          any = true;
        }
        if (any) draws++;
      }
    }
    w.shown = shown;
    if (budget > 0) {
      if (shown > budget) w.scale *= 0.97;
      else if (shown < budget * 0.88) w.scale *= 1.008;
      w.scale = Math.min(1, Math.max(0.25, w.scale));
    }
    for (const ch of w.chunks) ch.need = NONE;
    for (const c of w.cells) {
      let cl: i32 = -1;
      for (let l = 2; l >= 0 && cl < 0; l--) if (c.chunk[l] >= 0) cl = l;
      if (cl < 0) continue;
      const r: number[] = [c.reach[0] > 0 ? c.reach[0] : nearR, c.reach[1] > 0 ? c.reach[1] : midR];
      for (let e = 0; e < ne; e++) {
        const d = e === 0 ? c.d : boxDist(c, eyes, e * 3);
        const co = w.chunks[c.chunk[cl]];
        if (d < co.need) co.need = d;
        let want = wantOf(d, r);
        while (want < cl && c.chunk[want] < 0) want++;
        if (want < cl) { const ch = w.chunks[c.chunk[want]]; if (LATER + d < ch.need) ch.need = LATER + d; }
      }
    }
    const ask: i32[] = [], freed: i32[] = [];
    for (let k = 0; k < w.chunks.length; k++) {
      const ch = w.chunks[k];
      if (ch.loaded) {
        if (ch.need < NONE || ch.level === 2) ch.idle = 0;
        else if ((ch.idle += dt) > idleMax && idleMax > 0 && freed.length < FREE) { freed.push(k); ch.idle = 0; }
        continue;
      }
      if (ch.need >= NONE || (ask.length === ASK && ch.need >= w.chunks[ask[ask.length - 1]].need)) continue;
      if (ask.length < ASK) ask.push(k);
      let j = ask.length - 1;
      while (j > 0 && w.chunks[ask[j - 1]].need > ch.need) { ask[j] = ask[j - 1]; j--; }
      ask[j] = k;
    }
    out.length = 0;
    out.push(shown); out.push(draws); out.push(Math.floor(w.scale * 1000)); out.push(ask.length); out.push(freed.length);
    for (const k of ask) out.push(k);
    for (const k of freed) out.push(k);
  },
  worldDraw(id: i32): void { const w = world(id); if (w === null) return; tris += w.shown; },
};
