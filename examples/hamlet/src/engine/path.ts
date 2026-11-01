import { TERRAIN_GRASS, ROAD_COST, WALK_SPEED, ROAD_SPEED } from '../constants';
import { world, Mover, neighbor, tileAt, tileX, tileY } from '../world/world';

export const UNREACHABLE = 1e9;
export interface Field { dist: number[]; prev: number[]; }

export function isWalkable(t: number): boolean {
  return world.terrain[t] === TERRAIN_GRASS && world.tree[t] === 0 && world.rock[t] === 0 && world.build[t] < 0;
}

/** Cheapest walking cost from start to every tile (roads are cheaper than grass). 144 tiles: a plain scan is enough. */
export function fieldFrom(start: number): Field {
  const n = world.size * world.size;
  const dist = Array.from({ length: n }, (): number => UNREACHABLE);
  const prev = Array.from({ length: n }, (): number => -1);
  const done = Array.from({ length: n }, (): number => 0);
  dist[start] = 0;
  for (;;) {
    let u = -1, best = UNREACHABLE;
    for (let t = 0; t < n; t++) if (!done[t] && dist[t] < best) { best = dist[t]; u = t; }
    if (u < 0) break;
    done[u] = 1;
    for (let d = 0; d < 4; d++) {
      const v = neighbor(u, d);
      if (v < 0 || !isWalkable(v)) continue;
      const cost = dist[u] + (world.road[v] ? ROAD_COST : 1);
      if (cost < dist[v]) { dist[v] = cost; prev[v] = u; }
    }
  }
  return { dist, prev };
}

/** The tile to walk to for reaching goal: the goal itself, or its cheapest walkable neighbour when it is blocked (a tree, a building). */
export function approachTile(field: Field, goal: number): number {
  if (isWalkable(goal)) return field.dist[goal] < UNREACHABLE ? goal : -1;
  let best = -1, bestCost = UNREACHABLE;
  for (let d = 0; d < 4; d++) {
    const v = neighbor(goal, d);
    if (v >= 0 && field.dist[v] < bestCost) { bestCost = field.dist[v]; best = v; }
  }
  return best;
}

export function pathTo(field: Field, target: number): number[] {
  const out: number[] = [];
  let t = target;
  while (field.prev[t] >= 0) { out.push(t); t = field.prev[t]; }
  out.reverse();
  return out;
}

/** Sends a mover to a tile (or next to it when it is blocked). False when there is no way. */
export function planPath(m: Mover, goal: number): boolean {
  const from = tileAt(m.x, m.y);
  if (from < 0) return false;
  const field = fieldFrom(from);
  const target = approachTile(field, goal);
  if (target < 0) return false;
  m.path = pathTo(field, target);
  m.step = 0;
  return true;
}

export function isMoving(m: Mover): boolean { return m.step < m.path.length; }

/** Advances along the path; true once it is finished (or blocked by a new obstacle). */
export function walk(m: Mover, dt: number, speed: number): boolean {
  if (m.step >= m.path.length) return true;
  const t = m.path[m.step];
  if (!isWalkable(t)) { m.path = []; m.step = 0; return true; }
  const here = tileAt(m.x, m.y);
  const pace = speed * (here >= 0 && world.road[here] ? ROAD_SPEED : 1);
  const dx = tileX(t) - m.x, dy = tileY(t) - m.y, dist = Math.sqrt(dx * dx + dy * dy), len = pace * dt;
  m.phase += len * 3.2;
  if (dist <= len) { m.x = tileX(t); m.y = tileY(t); m.step++; return m.step >= m.path.length; }
  m.x += dx / dist * len; m.y += dy / dist * len;
  m.yaw = Math.atan2(dy, dx);
  return false;
}
export const PERSON_SPEED = WALK_SPEED;
