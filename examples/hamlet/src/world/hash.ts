import { world, tileCount } from './world';
import { stockWithCarried } from '../engine/transport';

/** FNV-1a over what decides the game: the tiles, the buildings and their stocks, the people, the stocks, the tick and the generator. Positions of people and deer are not part of it (they are not saved yet). */
export function stateHash(): number {
  let h = 2166136261;
  const mix = (v: number): void => { h = Math.imul(h ^ (v | 0), 16777619); };
  mix(world.seed); mix(world.size); mix(world.tick); mix(world.rng);
  for (let t = 0; t < tileCount(); t++) mix(world.terrain[t] | (world.road[t] << 2) | (world.tree[t] << 3) | (world.rock[t] << 6) | (world.lode[t] << 10) | (world.height[t] << 22));
  for (const b of world.buildings) if (b.alive) { mix(b.type); mix(b.i); mix(b.j); if (b.w * b.h > 1) { mix(b.w); mix(b.h); } mix(b.residents); for (const c of b.cover) mix(c); mix(b.level); mix(b.streak); mix(b.happy); mix(b.fire); mix(b.damage); mix(b.crime); mix(b.burn); mix(b.turn); for (const o of b.orders) mix(o); }
  for (let id = 0; id < world.buildings.length; id++) if (world.buildings[id].alive) for (const n of stockWithCarried(id)) mix(n);
  let people = 0;
  for (const p of world.people) { const home = world.buildings[p.home]; people = (people + Math.imul((home.j * world.size + home.i) | 0, 2654435761 | 0) + 1) | 0; }
  for (const g of world.goals) mix(g);
  for (const e of world.expeditions) { mix(e.adventure); mix(e.left); for (const h of e.homes) mix(h); }
  mix(world.peddlerLeft); for (const o of world.offers) { mix(o.resource); mix(o.qty); mix(o.coins); mix(o.taken ? 1 : 0); }
  mix(world.risks ? 1 : 0); mix(world.people.length); mix(people); mix(world.mood); mix(world.jobless);
  return h >>> 0;
}
