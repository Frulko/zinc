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
  draw(m: number): void { tris += meshes[m] ?? 0; },
  gpu(): boolean { return false; },
  end(): number { return tris; },
  present(): void {},
};
