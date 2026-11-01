import { REFERENCE_AREA, GATE_I } from '../constants';
import { settings } from '../settings';
import { world, random, isOpen, tileI, tileJ, tileCount } from '../world/world';

/** No-limit mode: below settings.treeMin trees (scaled by the map area), a new one grows every settings.treeRegrow seconds on a free tile away from the entrance. (Deer: see deer.ts.) */
export function updateNature(dt: number): void {
  if (!world.unlimited) return;
  world.treeTimer -= dt;
  if (world.treeTimer > 0) return;
  let trees = 0;
  for (const v of world.tree) if (v > 0) trees++;
  if (trees >= Math.round(settings.treeMin * tileCount() / REFERENCE_AREA)) { world.treeTimer = 1; return; }
  world.treeTimer = settings.treeRegrow;
  for (let tries = 0; tries < 40; tries++) {
    const t = Math.floor(random() * tileCount());
    if (!isOpen(t) || Math.abs(tileI(t) - GATE_I) + Math.abs(tileJ(t) - Math.floor(world.size / 2)) <= 2) continue;
    world.tree[t] = 1 + Math.floor(random() * 4); world.deco[t] = 0;
    world.revision++; world.saveDirty = true;
    return;
  }
}
