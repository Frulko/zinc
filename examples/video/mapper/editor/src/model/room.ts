// The room in 3D: the projector's lens and a surface's real size give where the surface stands, by decomposing its homography (Zhang's method).
// In the projector's axes: x right, y down, z forward; web axes (y up, z towards the viewer) are made at the end.
import { Placement, Point, placementMatrix, warp } from './geometry';

export type Vec3 = number[];
export interface Lens { throwRatio: number; shiftY: number }
export interface Pose { r1: Vec3; r2: Vec3; position: Vec3 }
export interface SurfaceGrid { points: Vec3[]; uvs: Point[]; triangles: i32[] }

const GRID_STEPS: i32 = 16;

function cross(a: Vec3, b: Vec3): Vec3 { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm(a: Vec3): number { return Math.hypot(a[0], a[1], a[2]); }
function scaled(a: Vec3, k: number): Vec3 { return [a[0] * k, a[1] * k, a[2] * k]; }

/** Pose of a flat surface of (width, height) metres, seen by a lens of throw ratio distance / picture width, its picture centre shifted by shiftY picture heights. Null when the corners are degenerate. */
export function surfacePose(p: Placement, aspect: number, width: number, height: number, lens: Lens): Pose | null {
  const M = placementMatrix(p, aspect);
  const cx = 0.5, cy = 0.5 + lens.shiftY;
  const column = (i: i32, perMetre: number): Vec3 => [
    (M[i] - cx * M[6 + i]) / lens.throwRatio * perMetre,
    (M[3 + i] - cy * M[6 + i]) / aspect / lens.throwRatio * perMetre,
    M[6 + i] * perMetre,
  ];
  const a1 = column(0, 1 / width), a2 = column(1, 1 / height), a3 = column(2, 1);
  const size = norm(a1);
  if (size < 1e-9) return null;
  const k = (a3[2] < 0 ? -1 : 1) / size;
  const r1 = scaled(a1, k);
  const toward = cross(r1, scaled(a2, k));
  const r3 = scaled(toward, 1 / norm(toward));
  return { r1, r2: cross(r3, r1), position: scaled(a3, k) };
}

/** Height over width of a real rectangle seen with these four corners: the lens tells it, whatever the picture's slant. */
export function surfaceShape(p: Placement, aspect: number, lens: Lens): number {
  const M = placementMatrix(p, aspect);
  const cy = 0.5 + lens.shiftY;
  const across = Math.hypot((M[0] - 0.5 * M[6]) / lens.throwRatio, (M[3] - cy * M[6]) / aspect / lens.throwRatio, M[6]);
  const down = Math.hypot((M[1] - 0.5 * M[7]) / lens.throwRatio, (M[4] - cy * M[7]) / aspect / lens.throwRatio, M[7]);
  return across > 1e-9 ? down / across : 1;
}

/** A surface for the solver: its sizes in metres, [0, 0] when nobody typed them. */
export interface RoomSurface { name: string; placement: Placement; typed: number[] }
/** Corner `cornerA` of the surface named `a` is the same physical point as corner `cornerB` of `b`. Corners in corner-pin order. */
export interface Link { a: string; cornerA: i32; b: string; cornerB: i32 }
export interface SolvedSurface { size: number[]; pose: Pose }

const CORNER_UV: number[][] = [[0, 0], [1, 0], [1, 1], [0, 1]];

function cornerAt(surface: SolvedSurface, corner: i32): Vec3 {
  const x = CORNER_UV[corner][0] * surface.size[0], y = CORNER_UV[corner][1] * surface.size[1];
  const p = surface.pose;
  return [p.r1[0] * x + p.r2[0] * y + p.position[0], p.r1[1] * x + p.r2[1] * y + p.position[1], p.r1[2] * x + p.r2[2] * y + p.position[2]];
}

/** Places every surface: its shape comes from its corners and the lens, its scale from a typed size, or from a link to a placed surface. Linked
 *  corners sit on one ray of the projector, so a link fixes how far the second surface stands. ponytail: scale only, each surface keeps its own
 *  corners; a global least-squares fit when linked loops disagree visibly. */
export function solveRoom(surfaces: RoomSurface[], links: Link[], aspect: number, lens: Lens): (SolvedSurface | null)[] {
  const solved: (SolvedSurface | null)[] = surfaces.map((surface: RoomSurface): SolvedSurface | null => {
    const shape = surfaceShape(surface.placement, aspect, lens);
    const size = surface.typed[0] > 0 && surface.typed[1] > 0 ? surface.typed : [1, shape];
    const pose = surfacePose(surface.placement, aspect, size[0], size[1], lens);
    return pose === null ? null : { size, pose };
  });
  const indexOf = (name: string): i32 => surfaces.findIndex((surface: RoomSurface) => surface.name === name) as i32;
  const fixed: boolean[] = surfaces.map((surface: RoomSurface) => surface.typed[0] > 0);
  if (fixed.indexOf(true) < 0 && fixed.length > 0) fixed[0] = true;
  // from what is fixed outwards; a surface with neither link nor typed size keeps its one metre
  for (let pass: i32 = 0; pass < surfaces.length; pass++) {
    for (const link of links) {
      const a: i32 = indexOf(link.a), b: i32 = indexOf(link.b);
      if (a < 0 || b < 0 || solved[a] === null || solved[b] === null || fixed[a] === fixed[b]) continue;
      const from: i32 = fixed[a] ? a : b, to: i32 = fixed[a] ? b : a;
      const fromCorner: i32 = fixed[a] ? link.cornerA : link.cornerB, toCorner: i32 = fixed[a] ? link.cornerB : link.cornerA;
      const target = solved[to] as SolvedSurface;
      const k = norm(cornerAt(solved[from] as SolvedSurface, fromCorner)) / norm(cornerAt(target, toCorner));
      solved[to] = { size: [target.size[0] * k, target.size[1] * k], pose: { r1: target.pose.r1, r2: target.pose.r2, position: scaled(target.pose.position, k) } };
      fixed[to] = true;
    }
  }
  return solved;
}

/** The surface as a grid of points in the projector's axes, following the deformation grid. */
export function surfaceGrid(mesh: number[], pose: Pose, width: number, height: number): SurfaceGrid {
  const points: Vec3[] = [];
  const uvs: Point[] = [];
  for (let j: i32 = 0; j <= GRID_STEPS; j++) {
    for (let i: i32 = 0; i <= GRID_STEPS; i++) {
      const s = i / GRID_STEPS, t = j / GRID_STEPS;
      const w = warp(mesh, s, t);
      const x = w[0] * width, y = w[1] * height;
      points.push([pose.r1[0] * x + pose.r2[0] * y + pose.position[0], pose.r1[1] * x + pose.r2[1] * y + pose.position[1], pose.r1[2] * x + pose.r2[2] * y + pose.position[2]]);
      uvs.push([s, t]);
    }
  }
  const triangles: i32[] = [];
  const side: i32 = GRID_STEPS + 1;
  for (let j: i32 = 0; j < GRID_STEPS; j++) {
    for (let i: i32 = 0; i < GRID_STEPS; i++) {
      const a: i32 = j * side + i;
      triangles.push(a, a + side, a + 1, a + 1, a + side, a + side + 1);
    }
  }
  return { points, uvs, triangles };
}

export function toWebAxes(p: Vec3): Vec3 { return [p[0], -p[1], -p[2]]; }

function pushU32(out: u8[], v: i32): void {
  for (let shift: i32 = 0; shift < 32; shift += 8) out.push(((v >>> shift) & 255) as u8);
}

/** IEEE 754 single, little endian: glTF's numbers. */
function pushF32(out: u8[], v: number): void {
  if (v === 0) { pushU32(out, 0); return; }
  const sign: i32 = v < 0 ? 1 : 0;
  const a = Math.abs(v);
  let exponent: i32 = Math.floor(Math.log2(a)) as i32;
  if (Math.pow(2, exponent) > a) exponent--;
  const mantissa: i32 = Math.round((a / Math.pow(2, exponent) - 1) * 8388608) as i32;
  pushU32(out, (sign << 31) | ((exponent + 127) << 23) | (mantissa & 8388607));
}

export interface SceneSurface { name: string; colour: number[]; grid: SurfaceGrid }

function padTo4(out: u8[], fill: u8): void {
  while (out.length % 4 !== 0) out.push(fill);
}

/** The scene as a binary glTF: one mesh per surface, in metres, the projector at the origin. ponytail: flat colours, the media stay with the show. */
export function sceneGlb(surfaces: SceneSurface[]): u8[] {
  const bin: u8[] = [];
  const views: string[] = [], accessors: string[] = [], materials: string[] = [], meshes: string[] = [], nodes: string[] = [];
  const addView = (start: i32, target: i32): i32 => {
    views.push(`{"buffer":0,"byteOffset":${start},"byteLength":${bin.length - start},"target":${target}}`);
    return views.length - 1;
  };
  surfaces.forEach((surface: SceneSurface, index: i32) => {
    const first: i32 = accessors.length;
    const low: Vec3 = [1e9, 1e9, 1e9], high: Vec3 = [-1e9, -1e9, -1e9];
    let start: i32 = bin.length;
    for (const point of surface.grid.points) {
      const p = toWebAxes(point);
      for (let k: i32 = 0; k < 3; k++) {
        pushF32(bin, p[k]);
        low[k] = Math.min(low[k], p[k]);
        high[k] = Math.max(high[k], p[k]);
      }
    }
    accessors.push(`{"bufferView":${addView(start, 34962)},"componentType":5126,"count":${surface.grid.points.length},"type":"VEC3","min":${JSON.stringify(low)},"max":${JSON.stringify(high)}}`);
    start = bin.length;
    for (const uv of surface.grid.uvs) {
      pushF32(bin, uv[0]);
      pushF32(bin, uv[1]);
    }
    accessors.push(`{"bufferView":${addView(start, 34962)},"componentType":5126,"count":${surface.grid.uvs.length},"type":"VEC2"}`);
    start = bin.length;
    for (const v of surface.grid.triangles) {
      bin.push((v & 255) as u8);
      bin.push(((v >> 8) & 255) as u8);
    }
    accessors.push(`{"bufferView":${addView(start, 34963)},"componentType":5123,"count":${surface.grid.triangles.length},"type":"SCALAR"}`);
    padTo4(bin, 0);
    const c = surface.colour;
    materials.push(`{"name":${JSON.stringify(surface.name)},"doubleSided":true,"pbrMetallicRoughness":{"baseColorFactor":[${c[0]},${c[1]},${c[2]},1],"metallicFactor":0,"roughnessFactor":1}}`);
    meshes.push(`{"name":${JSON.stringify(surface.name)},"primitives":[{"attributes":{"POSITION":${first},"TEXCOORD_0":${first + 1}},"indices":${first + 2},"material":${index}}]}`);
    nodes.push(`{"name":${JSON.stringify(surface.name)},"mesh":${index}}`);
  });
  const roots = nodes.map((_: string, i: i32) => `${i}`).join(',');
  const json = `{"asset":{"version":"2.0","generator":"Zinc mapper"},"scene":0,"scenes":[{"nodes":[${roots}]}],"nodes":[${nodes.join(',')}],"meshes":[${meshes.join(',')}],"materials":[${materials.join(',')}],"accessors":[${accessors.join(',')}],"bufferViews":[${views.join(',')}],"buffers":[{"byteLength":${bin.length}}]}`;
  const jsonBytes: u8[] = [];
  for (let i: i32 = 0; i < json.length; i++) jsonBytes.push(json.charCodeAt(i) as u8);   // names are made plain by the caller
  padTo4(jsonBytes, 32);
  const out: u8[] = [];
  pushU32(out, 0x46546c67);
  pushU32(out, 2);
  pushU32(out, 12 + 8 + jsonBytes.length + 8 + bin.length);
  pushU32(out, jsonBytes.length);
  pushU32(out, 0x4e4f534a);
  for (const b of jsonBytes) out.push(b);
  pushU32(out, bin.length);
  pushU32(out, 0x004e4942);
  for (const b of bin) out.push(b);
  return out;
}
