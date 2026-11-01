import { settings } from '../settings';
import { REFERENCE_AREA, DEER_SPEED, DEER_FLEE_SPEED, DEER_GRAZE, DEER_WALK, DEER_FLEE, DEER_GONE } from '../constants';
import { world, Deer, random, neighbor, tileAt, tileI, tileCount, spawnDeer } from '../world/world';
import { isWalkable, walk } from './path';

/** One short hop to a random free neighbouring tile. */
function hop(d: Deer): boolean {
  const here = tileAt(d.x, d.y);
  if (here < 0) return false;
  const first = Math.floor(random() * 4);
  for (let k = 0; k < 4; k++) {
    const v = neighbor(here, (first + k) % 4);
    if (v >= 0 && isWalkable(v)) { d.path = [v]; d.step = 0; return true; }
  }
  return false;
}

export function updateDeer(dt: number): void {
  let alive = 0;
  for (const d of world.deer) {
    if (d.state === DEER_GONE) continue;
    alive++;
    if (d.state === DEER_GRAZE) {
      d.timer -= dt;
      if (d.timer <= 0) { if (hop(d)) d.state = DEER_WALK; else d.timer = 2; }
    } else if (d.state === DEER_WALK) {
      if (walk(d, dt, DEER_SPEED)) { d.state = DEER_GRAZE; d.timer = 2 + random() * 5; }
    } else if (d.state === DEER_FLEE) {
      d.timer -= dt;
      if (walk(d, dt, DEER_FLEE_SPEED)) hop(d);
      if (d.timer <= 0) { d.state = DEER_GRAZE; d.timer = 2; }
    }
  }
  world.deerTimer -= dt;
  if (world.unlimited && alive < Math.round(settings.deerMin * tileCount() / REFERENCE_AREA) && world.deerTimer <= 0) {
    world.deerTimer = settings.deerRespawn;
    for (let tries = 0; tries < 30; tries++) {
      const t = Math.floor(random() * tileCount());
      if (world.terrain[t] === 0 && isWalkable(t) && world.road[t] === 0 && (tileI(t) >= world.size - 3 || tileI(t) <= 1)) { spawnDeer(t); break; }
    }
  }
}
