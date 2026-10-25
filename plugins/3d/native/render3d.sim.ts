// zinc:3d for the sim target: metadata only, no pixels. Meshes keep their triangle count, targets own a runtime
// image of the scaled size, end() returns the triangles submitted (no clipping or culling happens here).
import { createImage, destroyImage } from 'zinc:gfx';

const meshes: number[] = [];
interface T { img: number; w: number; h: number }
const targets: (T | null)[] = [];
let tris = 0;

export default {
  meshCreate(pos: number[], _nrm: number[], _uv: number[], _col: number[], idx: number[]): number {
    const nv = Math.floor(pos.length / 3);
    if (nv <= 0 || nv > 65535) return -1;
    meshes.push(Math.floor(idx.length / 3));
    return meshes.length - 1;
  },
  meshLoad(data: number[], at: number): number {
    const u32 = (o: number): number => (data[o] | data[o + 1] << 8 | data[o + 2] << 16) + data[o + 3] * 16777216;
    if (at < 0 || at + 24 > data.length) return -1;
    const nv = u32(at);
    if (nv <= 0 || nv > 65535) return -1;
    meshes.push(Math.floor(u32(at + 4) / 3));
    return meshes.length - 1;
  },
  meshDestroy(m: number): void { if (m >= 0 && m < meshes.length) meshes[m] = 0; },
  target(t: number, w: number, h: number): number {
    w = Math.max(1, w); h = Math.max(1, h);
    const cur = targets[t] ?? null;
    if (cur && cur.w === w && cur.h === h) return t;
    if (cur) destroyImage(cur.img);
    const nt: T = { img: createImage(w, h), w, h };
    if (cur) { targets[t] = nt; return t; }
    targets.push(nt);
    return targets.length - 1;
  },
  targetDestroy(t: number): void { const c = targets[t]; if (c) { destroyImage(c.img); targets[t] = null; } },
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
  draw(m: number): void { tris += meshes[m] ?? 0; },
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
  end(): number { return tris; },
  present(): void {},
  // ponytail: the sim draws no world (metadata only): it opens none
  worldOpen(): i32 { return -1; },
  worldLoad(): i32 { return -1; },
  worldFree(): void {},
  worldNight(): void {},
  worldSelect(): void {},
  worldDraw(): void {},
};
