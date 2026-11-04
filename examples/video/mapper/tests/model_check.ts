// The editor's maths without its interface: a surface placed in a known spot comes back from its corners, media sizes, the GLB's shape.
import { Point, footprint, insertMaskPoint, mediaSize } from '../editor/src/model/geometry';
import { Lens, Vec3, sceneGlb, surfaceGrid, surfacePose } from '../editor/src/model/room';
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
  const grid = surfaceGrid(placement.mesh, pose, 2, 1);
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

// a point clicked beyond the right edge of a square lands between its two right corners
const mask: number[] = [0.05, 0, 0.3, 0.3, 0.7, 0.3, 0.7, 0.7, 0.3, 0.7];
insertMaskPoint(mask, 0.9, 0.5);
near('inserted x', mask[6], 0.9, 0);
near('inserted y', mask[7], 0.5, 0);
near('next corner keeps its place', mask[8], 0.7, 0);

console.log(failures === 0 ? 'ok' : `${failures} failed`);
