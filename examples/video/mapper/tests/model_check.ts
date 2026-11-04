// The editor's maths without its interface: a surface placed in a known spot comes back from its corners, media sizes, the GLB's shape.
import { Point, footprint, insertMaskPoint, insidePolygon, mediaSize, warp, framedPart, zoneSize } from '../editor/src/model/geometry';
import { Lens, Link, SolvedSurface, Vec3, sceneGlb, solveRoom, surfaceGrid, surfaceShape, surfacePose } from '../editor/src/model/room';
import { addLink, linkedCorners, removeLinksOf } from '../editor/src/model/links';
import { Clip, Column, EMPTY_CLIP, clipFrom, ensureColumns, firstFreeColumn, isEmptyClip } from '../editor/src/model/clips';
import { PointEditor } from '../editor/src/model/pointEditor';

let failures = 0;
function near(what: string, got: number, want: number, tolerance: number): void {
  if (Math.abs(got - want) > tolerance) { console.log(`${what}: got ${got}, want ${want}`); failures++; }
}

// a 2 x 1 m surface, 3 m in front of a lens of throw 1.5, turned 30 degrees around the vertical axis
const aspect = 16 / 9;
const lens: Lens = { throwRatio: 1.5, shiftY: 0 };
const angle = 30 * Math.PI / 180;
const right: Vec3 = [Math.cos(angle), 0, Math.sin(angle)];
const down: Vec3 = [0, 1, 0];
const origin: Vec3 = [-0.8, -0.5, 3];
function project(x: number, y: number): Point {
  const px = origin[0] + right[0] * x + down[0] * y, py = origin[1] + right[1] * x + down[1] * y, pz = origin[2] + right[2] * x + down[2] * y;
  return [0.5 + lens.throwRatio * px / pz, 0.5 + lens.throwRatio * aspect * py / pz];
}
const c0 = project(0, 0), c1 = project(2, 0), c2 = project(2, 1), c3 = project(0, 1);
const placement = { corners: [c0[0], c0[1], c1[0], c1[1], c2[0], c2[1], c3[0], c3[1]], position: [0, 0], scale: 1, rotation: 0, mesh: [2, 2, 0, 0, 1, 0, 0, 1, 1, 1] };
const pose = surfacePose(placement, aspect, 2, 1, lens);
if (pose === null) { console.log('no pose'); failures++; }
else {
  near('distance', pose.position[2], 3, 1e-6);
  near('x', pose.position[0], -0.8, 1e-6);
  near('y', pose.position[1], -0.5, 1e-6);
  near('turn', pose.r1[2], Math.sin(angle), 1e-6);
  near('upright', pose.r2[1], 1, 1e-6);
  const at = (x: number, y: number): Vec3 => [0, 1, 2].map((k: i32): number => pose.r1[k] * x + pose.r2[k] * y + pose.position[k]);
  const grid = surfaceGrid(placement.mesh, [at(0, 0), at(2, 0), at(2, 1), at(0, 1)]);
  const last = grid.points[grid.points.length - 1];
  near('far corner', last[2], origin[2] + right[2] * 2, 1e-6);
  const glb = sceneGlb([{ name: 'wall', colour: [1, 0, 0], grid }]);
  near('glb magic', glb[0], 0x67, 0);
  near('glb length', glb[8] + glb[9] * 256 + glb[10] * 65536, glb.length, 0);
  near('glb aligned', glb.length % 4, 0, 0);
}

const flat = { corners: [0, 0, 0.5, 0, 0.5, 0.5, 0, 0.5], position: [0, 0], scale: 1, rotation: 0, mesh: [2, 2, 0, 0, 1, 0, 0, 1, 1, 1] };
const covered = footprint(flat, aspect, [854, 480]);
near('covered width', covered[0], 427, 1e-6);
near('even width', mediaSize(covered, 0, 0)[0], 428, 0);
near('shaped height', mediaSize(covered, 2, 1)[1], 240, 0);

// the arrows move every selected point
const moved: number[] = [0, 0];
const editor = new PointEditor();
const points = [{ x: 0, y: 0, set: (x: number, y: number) => { moved[0] = x; moved[1] = y; } }];
editor.pick(0, false);
editor.move(points, 0.25, 0.5);
near('moved', moved[0] + moved[1], 0.75, 0);
editor.step(1, true);
near('step stays', editor.selection[0], 0, 0);

// what each fit shows of a picture twice as wide as its zone
near('cover cuts the width', framedPart('cover', 2, [0, 0, 1])[2], 0.5, 1e-6);
near('cover keeps the middle', framedPart('cover', 2, [0, 0, 1])[0], 0.25, 1e-6);
near('cover slides to the start', framedPart('cover', 2, [-1, 0, 1])[0], 0, 1e-6);
near('cover slides to the end', framedPart('cover', 2, [1, 0, 1])[0], 0.5, 1e-6);
near('contain leaves bars', framedPart('contain', 2, [0, 0, 1])[3], 2, 1e-6);
near('width as contain here', framedPart('width', 2, [0, 0, 1])[3], 2, 1e-6);
near('height as cover here', framedPart('height', 2, [0, 0, 1])[2], 0.5, 1e-6);
near('zoom reads less', framedPart('stretch', 2, [0, 0, 2])[2], 0.5, 1e-6);
near('zone width', zoneSize([0, 0, 0.5, 0, 0.5, 0.5, 0, 0.5], 2)[0], 1, 1e-6);

// a fade outside the surface goes on along its border: past 0 and past 1 on a flat mesh
const flatMesh: number[] = [2, 2, 0, 0, 1, 0, 0, 1, 1, 1];
near('warp before the left side', warp(flatMesh, -0.2, 0.5)[0], -0.2, 1e-6);
near('warp past the right side', warp(flatMesh, 1.3, 0.5)[0], 1.3, 1e-6);

// a point clicked beyond the right edge of a square lands between its two right corners
const mask: number[] = [0.05, 0, 0.3, 0.3, 0.7, 0.3, 0.7, 0.7, 0.3, 0.7];
insertMaskPoint(mask, 0.9, 0.5);
near('inserted x', mask[6], 0.9, 0);
near('inserted y', mask[7], 0.5, 0);
near('next corner keeps its place', mask[8], 0.7, 0);

// a click inside a zone hits it, even a slanted one; beside it does not
const zone: number[] = [0.1, 0.1, 0.5, 0.2, 0.4, 0.9, 0.05, 0.8];
near('inside', insidePolygon(zone, 0.3, 0.5) ? 1 : 0, 1, 0);
near('outside', insidePolygon(zone, 0.48, 0.8) ? 1 : 0, 0, 0);

// two faces of a real box, 2 x 1.5 and 1 x 1.5 metres, sharing an edge, seen from a known spot: the shape comes back from the corners alone, and links join them
const boxLens: Lens = { throwRatio: 1.4, shiftY: 0 };
const boxAspect = 16 / 9;
function onOutput(p: Vec3): number[] { return [0.5 + boxLens.throwRatio * p[0] / p[2], 0.5 + boxLens.throwRatio * boxAspect * p[1] / p[2]]; }
function faceOf(points: Vec3[]): any {
  const corners: number[] = [];
  for (const p of points) corners.push(onOutput(p)[0], onOutput(p)[1]);
  return { corners, position: [0, 0], scale: 1, rotation: 0, mesh: [2, 2, 0, 0, 1, 0, 0, 1, 1, 1] };
}
const front = faceOf([[-1, -0.75, 4.2], [1, -0.75, 3.8], [1, 0.75, 3.8], [-1, 0.75, 4.2]]);
const side = faceOf([[1, -0.75, 3.8], [1.6, -0.75, 4.6], [1.6, 0.75, 4.6], [1, 0.75, 3.8]]);
near('front shape', surfaceShape(front, boxAspect, boxLens), 1.5 / Math.hypot(2, 0.4), 0.02);
near('side shape', surfaceShape(side, boxAspect, boxLens), 1.5, 0.02);
const boxLinks: Link[] = [{ a: 'front', cornerA: 1, b: 'side', cornerB: 0 }, { a: 'front', cornerA: 2, b: 'side', cornerB: 3 }];
const room = solveRoom([{ name: 'front', placement: front, typed: [Math.hypot(2, 0.4), 1.5] }, { name: 'side', placement: side, typed: [0, 0] }], boxLinks, boxAspect, boxLens);
const sideSolved = room[1] as SolvedSurface;
near('the link gives the side its size', sideSolved.size[0], 1, 0.03);
near('the link puts the side at its place', sideSolved.pose.position[2], 3.8, 0.05);
// two linked corners that disagree on their depth: the faces still join, on the projector's rays
const frontSolved = room[0] as SolvedSurface;
for (const link of boxLinks) {
  const one = (link.a === 'front' ? frontSolved : sideSolved).corners[link.cornerA], other = (link.b === 'front' ? frontSolved : sideSolved).corners[link.cornerB];
  near('linked corners are one point', Math.hypot(one[0] - other[0], one[1] - other[1], one[2] - other[2]), 0, 1e-3);
}

// links reach through each other, and go
const chain: Link[] = [];
addLink(chain, { layer: 'a', corner: 0 }, { layer: 'b', corner: 1 });
addLink(chain, { layer: 'b', corner: 1 }, { layer: 'c', corner: 2 });
addLink(chain, { layer: 'a', corner: 0 }, { layer: 'c', corner: 2 });
near('no double link', chain.length, 2, 0);
near('linked through', linkedCorners(chain, { layer: 'a', corner: 0 }).length, 2, 0);
removeLinksOf(chain, { layer: 'b', corner: 1 });
near('unlinked', linkedCorners(chain, { layer: 'a', corner: 0 }).length, 0, 0);

// the grid keeps room for one more clip, and reads the shows saved before sources
const grid: Column[] = ensureColumns([]);
near('eight columns to begin with', grid.length, 8, 0);
grid[7].cells.push({ ...EMPTY_CLIP, label: 'a', source: 'solid' });
ensureColumns(grid);
near('a free column stays at the end', grid.length, 9, 0);
near('first free skips what is taken', firstFreeColumn([{ name: 'a', cells: [{ ...EMPTY_CLIP, media: 'x' }] }, { name: 'b', cells: [] as Clip[] }], 0), 1, 0);
near('an old cell keeps its media', isEmptyClip(clipFrom({ media: 'x.mp4', fit: 'cover' })) ? 0 : 1, 1, 0);
near('an old empty cell stays empty', isEmptyClip(clipFrom({ media: '', fit: 'cover' })) ? 1 : 0, 1, 0);

console.log(failures === 0 ? 'ok' : `${failures} failed`);
