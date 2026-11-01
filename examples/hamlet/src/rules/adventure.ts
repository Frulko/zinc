import { ROLE_SETTLER, ROLE_PEDDLER } from '../constants';
import { world, Expedition, random } from '../world/world';
import { economy, Adventure } from '../world/economy';
import { canPay, pay, give } from './stock';
import { takeForExpedition, createResident } from '../engine/villagers';

// Adventures: a few villagers leave for some days, come back with a reward, and some may be lost. The data is economy.json "adventures"; starting and returning
// are commands (rules/commands.ts), the risk uses the simulation's generator, so the same ticks give the same outcome.
export const MAX_EXPEDITIONS = 2;

/** People who could go: residents and workers, not the arriving settlers nor the peddler. */
export function available(): number {
  let n = 0;
  for (const p of world.people) if (p.role !== ROLE_SETTLER && p.role !== ROLE_PEDDLER) n++;
  return n;
}
export function canStart(k: number): boolean {
  if (k < 0 || k >= economy.adventures.length || world.expeditions.length >= MAX_EXPEDITIONS) return false;
  const a = economy.adventures[k];
  return available() >= a.workers && canPay(a.cost);
}
/** The `adventure_start` command: pays the cost and takes the people out of the village. */
export function applyStart(k: number): boolean {
  if (!canStart(k)) return false;
  const a = economy.adventures[k], e = new Expedition();
  pay(a.cost);
  e.adventure = k; e.left = a.days; e.homes = takeForExpedition(a.workers);
  world.expeditions.push(e); world.saveDirty = true;
  world.news.push('Expédition partie : ' + a.title + ' (' + a.days + ' jour' + (a.days > 1 ? 's' : '') + ').');
  return true;
}
/** The `adventure_return` command (a = index in world.expeditions): each member is lost with the risk, the survivors walk home and bring the reward. */
export function applyReturn(i: number): boolean {
  if (i < 0 || i >= world.expeditions.length) return false;
  const e = world.expeditions[i], a = economy.adventures[e.adventure];
  let back = 0;
  for (const home of e.homes) {
    if (random() * 100 < a.risk) { const h = world.buildings[home]; if (h.alive && h.residents > 0) h.residents--; continue; }   // lost: his place in the house is free again
    if (world.buildings[home].alive) { createResident(home); back++; }
  }
  if (back > 0) for (let r = 0; r < a.rewards.length; r++) if (a.rewards[r] > 0) give(r, a.rewards[r]);
  world.expeditions.splice(i, 1); world.saveDirty = true;
  world.news.push(back === 0 ? 'L’expédition « ' + a.title + ' » n’est pas revenue.' : 'Retour de « ' + a.title + ' » : ' + back + ' sur ' + e.homes.length + ' reviennent avec leur butin.');
  return true;
}
/** What a panel shows: each adventure with its length, people, cost and risk. */
export function adventureLines(): string[] {
  return economy.adventures.map((a: Adventure, k: number): string => a.title + ' : ' + a.workers + ' habitants, ' + a.days + ' jour(s)' + (a.risk > 0 ? ', risque ' + a.risk + ' %' : '') + (canStart(k) ? '' : ' (indisponible)'));
}
/** The expeditions under way, with the days left. */
export function expeditionLines(): string[] {
  return world.expeditions.map((e: Expedition): string => economy.adventures[e.adventure].title + ' : encore ' + e.left + ' jour(s), ' + e.homes.length + ' habitants');
}
