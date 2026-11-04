import { world, spawnDeer, tileAt, tileI, tileJ, tileIndex } from '../world/world';
import { SPECIES, KIND_WOLF } from '../rules/species';
import { REFERENCE_AREA, DEER_GONE, DEER_DEAD } from '../constants';
import { isWalkable } from './path';
import { season } from '../rules/season';

// Far animals as numbers. On a big map the animals far from every building and from the camera are not simulated: each region of REGION_TILES x REGION_TILES tiles keeps a count per species (world.sleepers),
// a statistical model moves it once a day (births in the breeding seasons up to the region's share of the cap, deaths of old age), and the animals are placed again, at tiles drawn from a generator of the
// region's own, when a building comes within FAR_TILES of the region or the camera comes near. Near behaviour is the full simulation, unchanged; maps under WILD_MIN_SIZE keep every animal awake.
// The generator is local (never world.rng): waking or sleeping animals does not move the dice the village plays with.
export const REGION_TILES = 16, FAR_TILES = 40, WILD_MIN_SIZE = 192, WAKE_REGIONS = 2;
const S = SPECIES.length;
const regions = (): number => Math.ceil(world.size / REGION_TILES);
const regionOf = (t: number): number => Math.floor(tileJ(t) / REGION_TILES) * regions() + Math.floor(tileI(t) / REGION_TILES);

/** Park-Miller, seeded by region, day and a salt: the same numbers on every engine. */
function local(region: number, salt: number): () => number {
  let x = (region * 7919 + world.tick * 31 + salt * 104729 + 1) % 2147483647;
  if (x <= 0) x = 1;
  return (): number => { x = (x * 48271) % 2147483647; return x / 2147483647; };
}
/** The count table has a cell per region and species (zinc reads past the end of an array as an error). */
function table(): void { const need = regions() * regions() * S; while (world.sleepers.length < need) world.sleepers.push(0); }
/** Places the sleepers of a region again on open ground inside it. */
function wake(region: number): void {
  table();
  const n = regions(), ri = region % n, rj = Math.floor(region / n);
  for (let sp = 0; sp < S; sp++) {
    const c = world.sleepers[region * S + sp];
    if (c <= 0) continue;
    const rand = local(region, sp + 1);
    world.sleepers[region * S + sp] = 0; world.sleeping -= c;
    for (let k = 0; k < c; k++) {
      for (let tries = 0; tries < 20; tries++) {
        const i = ri * REGION_TILES + Math.floor(rand() * REGION_TILES), j = rj * REGION_TILES + Math.floor(rand() * REGION_TILES);
        if (i >= world.size || j >= world.size) continue;
        const t = tileIndex(i, j);
        if (isWalkable(t) && world.road[t] === 0 && i > 3) { spawnDeer(t, sp, false, rand); break; }
      }
    }
  }
}
/** Each tick: the regions around the camera wake, when anything sleeps (nothing to do otherwise). */
export function wakeNearCamera(): void {
  if (world.sleeping <= 0 || world.watch < 0) return;
  const n = regions(), r0 = regionOf(world.watch), ri = r0 % n, rj = Math.floor(r0 / n);
  for (let dj = -WAKE_REGIONS; dj <= WAKE_REGIONS; dj++) for (let di = -WAKE_REGIONS; di <= WAKE_REGIONS; di++) {
    const a = ri + di, b = rj + dj;
    if (a >= 0 && b >= 0 && a < n && b < n) wake(b * n + a);
  }
}
/** Once a day: the regions within FAR_TILES of a building or the camera are awake, the animals of the others fall asleep, and the sleeping counts follow the season. */
export function dailyWild(): void {
  if (world.size < WILD_MIN_SIZE) return;
  table();
  const n = regions(), near: number[] = [];
  for (let r = 0; r < n * n; r++) near.push(0);
  const mark = (i: number, j: number, reach: number): void => {
    for (let b = Math.max(0, Math.floor((j - reach) / REGION_TILES)); b <= Math.min(n - 1, Math.floor((j + reach) / REGION_TILES)); b++)
      for (let a = Math.max(0, Math.floor((i - reach) / REGION_TILES)); a <= Math.min(n - 1, Math.floor((i + reach) / REGION_TILES)); a++) near[b * n + a] = 1;
  };
  for (const b of world.buildings) if (b.alive) mark(b.i, b.j, FAR_TILES);
  mark(tileI(world.gate), tileJ(world.gate), FAR_TILES);
  if (world.watch >= 0) mark(tileI(world.watch), tileJ(world.watch), WAKE_REGIONS * REGION_TILES);
  for (const d of world.deer) {
    if (d.state === DEER_GONE || d.state === DEER_DEAD || d.hunted || SPECIES[d.species].kind === KIND_WOLF) continue;
    const t = tileAt(d.x, d.y);
    if (t < 0 || near[regionOf(t)] === 1) continue;
    const slot = regionOf(t) * S + d.species;
    world.sleepers[slot]++; world.sleeping++; d.state = DEER_GONE;
  }
  for (let r = 0; r < n * n; r++) {
    if (near[r] === 1) { wake(r); continue; }
    for (let sp = 0; sp < S; sp++) {
      const c = world.sleepers[r * S + sp];
      if (c <= 0) continue;
      const k = SPECIES[sp], rand = local(r, 100 + sp), cap = Math.max(2, Math.round(k.perArea * REGION_TILES * REGION_TILES / REFERENCE_AREA));
      let next = c;
      if (k.breedSeasons.indexOf(season()) >= 0 && next < cap) next += Math.floor(next * k.breedChance * .3 + rand());
      if (rand() < next / k.lifeDays) next--;
      next = Math.max(0, Math.min(cap, next));
      world.sleepers[r * S + sp] = next; world.sleeping += next - c;
    }
  }
}
