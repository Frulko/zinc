// The disc of a pool of light cut to the level it lies on (examples/pinball3d/src/geometry.ts, discWithin), for
// tests/t1/pinball3d.sh: the area of what is left of a disc of radius 2 inside an L-shaped level (a square of 10 with its
// top right quarter taken away), as a share of the whole disc. Whole in the middle of an arm, a half on a straight edge,
// a quarter on an outer corner, three quarters on the corner that goes in.
import { Polyline, discWithin } from '../../../../examples/pinball3d/src/geometry';

const level = new Polyline();
level.closed = true;
for (const p of [[0, 0], [5, 0], [5, 5], [10, 5], [10, 10], [0, 10]]) level.add(p[0], p[1]);
function area(xy: number[]): number {
  let a = 0;
  for (let i = 0; i + 5 < xy.length; i += 6) a += Math.abs((xy[i + 2] - xy[i]) * (xy[i + 5] - xy[i + 1]) - (xy[i + 4] - xy[i]) * (xy[i + 3] - xy[i + 1])) / 2;
  return a;
}
const whole = area(discWithin(level, 2.5, 7.5, 2, 4, 20));
const share = (x: number, y: number): string => (area(discWithin(level, x, y, 2, 4, 20)) / whole).toFixed(2);
console.log(`inside ${share(2.5, 2.5)} edge ${share(0, 7)} corner ${share(0, 0)} inner corner ${share(5, 5)} outside ${share(8, 2)}`);
