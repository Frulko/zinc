import { world, tileIndex, tileI, tileJ, isOpen } from '../world/world';
import { fieldFrom, pathTo, isWalkable, UNREACHABLE } from '../engine/path';

/** The tiles a road drag would lay, as Caesar III draws them: `tiles` is the walk from start to end (cut at the first obstacle, which is its last tile and `blocked`),
 *  `fresh` the ones that still have to be built (an existing road is skipped and costs nothing). */
export class RoadPlan { tiles: number[] = []; fresh: number[] = []; blocked: number = -1; }

/** The L-shaped walk from a to b: along the longer side first, the corner under the cursor; `flip` takes the other side first. Pure. */
export function linePath(a: number, b: number, flip: boolean): number[] {
  const ai = tileI(a), aj = tileJ(a), bi = tileI(b), bj = tileJ(b);
  const iFirst = (Math.abs(bi - ai) >= Math.abs(bj - aj)) !== flip;
  const out: number[] = [a];
  let i = ai, j = aj;
  const stepI = (): void => { while (i !== bi) { i += bi > i ? 1 : -1; out.push(tileIndex(i, j)); } };
  const stepJ = (): void => { while (j !== bj) { j += bj > j ? 1 : -1; out.push(tileIndex(i, j)); } };
  if (iFirst) { stepI(); stepJ(); } else { stepJ(); stepI(); }
  return out;
}

/** The plan for a drag from a to b. `route`: when the L is blocked, go round trees, rocks, water and buildings with a shortest walk (existing roads preferred). */
export function planRoad(a: number, b: number, flip: boolean, route: boolean): RoadPlan {
  let path = linePath(a, b, flip);
  if (route && path.some((t) => world.road[t] === 0 && !isOpen(t)) && isWalkable(a) && isWalkable(b)) {
    const field = fieldFrom(a);
    if (field.dist[b] < UNREACHABLE) path = [a].concat(pathTo(field, b));
  }
  const plan = new RoadPlan();
  for (const t of path) {
    plan.tiles.push(t);
    if (world.road[t] !== 0) continue;
    if (!isOpen(t)) { plan.blocked = t; break; }
    plan.fresh.push(t);
  }
  return plan;
}
