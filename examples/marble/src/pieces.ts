// The course's pieces modelled from Kenney's kits (assets/models, models.json): read from their .zmesh files and merged,
// moved and turned, into one mesh per chunk of the course, so a frame stays under 60 draw calls however many pieces stand
// on it. A piece's pivot is its cell's centre at its floor height; yaw 0 puts an edge piece on the cell's +Z edge, 90 on +X.
// The low variant is for the 480x272, 640x448 and 400x240 screens, the high one for the Vita's and the desktop's.
import { exists, readBytes } from 'zinc:assets';
import { Mesh } from 'zinc:3d';

/** Geometry gathered for one mesh: positions, normals, uvs, 0xRRGGBB colours, indices. */
export class Builder {
  pos: number[] = []; nrm: number[] = []; uv: number[] = []; col: u32[] = []; idx: i32[] = [];
  vertices(): i32 { return this.pos.length / 3; }
  /** A quad: four corners counter-clockwise seen from outside, its normal, uvs and colours. */
  quad(p: number[], n: number[], uv: number[], c: u32[]): void {
    const b = this.vertices();
    for (let k = 0; k < 4; k++) {
      this.pos.push(p[k * 3]); this.pos.push(p[k * 3 + 1]); this.pos.push(p[k * 3 + 2]);
      this.nrm.push(n[0]); this.nrm.push(n[1]); this.nrm.push(n[2]);
      this.uv.push(uv[k * 2]); this.uv.push(uv[k * 2 + 1]);
      this.col.push(c[k]);
    }
    this.idx.push(b); this.idx.push(b + 1); this.idx.push(b + 2); this.idx.push(b); this.idx.push(b + 2); this.idx.push(b + 3);
  }
  mesh(): Mesh | null { return this.idx.length === 0 ? null : new Mesh(this.pos, this.idx, this.nrm, this.uv, this.col); }
}

function u16(d: u8[], at: i32): i32 { return d[at] | (d[at + 1] << 8); }
function u32(d: u8[], at: i32): i32 { return d[at] | (d[at + 1] << 8) | (d[at + 2] << 16) | (d[at + 3] << 24); }
/** An IEEE 754 single from its four bytes (the language has no typed views): sign, exponent, fraction. */
function f32(d: u8[], at: i32): number {
  const hi = d[at + 3], exp = ((hi & 0x7f) << 1) | (d[at + 2] >> 7), frac = ((d[at + 2] & 0x7f) << 16) | (d[at + 1] << 8) | d[at];
  const v = exp === 0 ? frac * Math.pow(2, -149) : (1 + frac / 8388608) * Math.pow(2, exp - 127);
  return (hi & 0x80) !== 0 ? -v : v;
}

/** The parts of a .zmesh merged into flat arrays (zmesh.h): what `place` copies. */
export class Piece {
  pos: number[] = []; nrm: number[] = []; col: u32[] = []; idx: i32[] = [];
  triangles(): i32 { return this.idx.length / 3; }
}

const UVS = 1, COLORS = 2;
function read(file: string): Piece {
  const d = readBytes(file), p = new Piece();
  let at: i32 = 16;
  for (let i = 0; i < u32(d, 8); i++) at += 4 + ((u32(d, at) + 3) & ~3);   // texture names: the pieces have none
  for (let k = 0; k < u32(d, 4); k++) {
    const nv = u32(d, at), ni = u32(d, at + 4), flags = u32(d, at + 8), colour = (u32(d, at + 12) & 0xffffff) as u32;
    const base = p.pos.length / 3;
    let v = at + 24;
    for (let i = 0; i < nv * 3; i++) p.pos.push(f32(d, v + i * 4));
    v += nv * 12;
    for (let i = 0; i < nv * 3; i++) p.nrm.push(f32(d, v + i * 4));
    v += nv * 12;
    if ((flags & UVS) !== 0) v += nv * 8;
    for (let i = 0; i < nv; i++) p.col.push((flags & COLORS) !== 0 ? (u32(d, v + i * 4) & 0xffffff) as u32 : colour);
    if ((flags & COLORS) !== 0) v += nv * 4;
    for (let i = 0; i < ni; i++) p.idx.push(base + u16(d, v + i * 2));
    at = v + ((ni * 2 + 3) & ~3);
  }
  return p;
}

export class Pieces {
  variant: string;
  private cache: Map<string, Piece> = new Map<string, Piece>();
  constructor(variant: string) { this.variant = variant; }
  /** The file of a piece, '' when the course art is not there (the game then builds its own meshes). */
  file(name: string): string {
    const f = `models/${this.variant}/${name}.zmesh`;
    return exists(f) ? f : '';
  }
  get(name: string): Piece {
    const cached = this.cache.get(name);
    if (cached !== undefined) return cached;
    const p = read(this.file(name));
    this.cache.set(name, p);
    return p;
  }
  /** Copies the piece into `b`, its pivot at (x, y, z), turned by `yaw` degrees about +Y. */
  place(b: Builder, name: string, x: number, y: number, z: number, yaw: number): void {
    const p = this.get(name), base = b.vertices();
    const a = yaw * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    for (let i = 0; i < p.pos.length / 3; i++) {
      const px = p.pos[i * 3], pz = p.pos[i * 3 + 2], nx = p.nrm[i * 3], nz = p.nrm[i * 3 + 2];
      b.pos.push(x + px * c + pz * s); b.pos.push(y + p.pos[i * 3 + 1]); b.pos.push(z - px * s + pz * c);
      b.nrm.push(nx * c + nz * s); b.nrm.push(p.nrm[i * 3 + 1]); b.nrm.push(-nx * s + nz * c);
      b.uv.push(0); b.uv.push(0);
      b.col.push(p.col[i]);
    }
    for (const k of p.idx) b.idx.push(base + k);
  }
}
