import { ROLE_PEDDLER, ST_IDLE, DAY_TICKS } from '../constants';
import { world, Offer, random } from '../world/world';
import { economy } from '../world/economy';
import { newPerson } from './villagers';

const hallId = (): number => { for (let id = 0; id < world.buildings.length; id++) if (world.buildings[id].fixed) return id; return 0; };
/** The peddler (a person at the gate, for the picture) is here while `peddlerLeft` > 0. */
export function spawnPeddler(): void {
  const p = newPerson(ROLE_PEDDLER, hallId(), world.gate + 1);
  p.state = ST_IDLE; p.timer = 1e9;
  world.people.push(p);
}
function dismissPeddler(): void { world.people = world.people.filter((p: { role: number }): boolean => p.role !== ROLE_PEDDLER); }

/** Draws the lines of one visit from the table with the world's generator: the same ticks bring the same offers. Prices wander 10% around the resource's price. */
function drawOffers(): Offer[] {
  const t = economy.trade, picked: number[] = [], out: Offer[] = [];
  while (picked.length < t.offers) { const k = Math.floor(random() * t.table.length); if (picked.indexOf(k) < 0) picked.push(k); }
  for (const k of picked) {
    const row = t.table[k], o = new Offer(), pct = 90 + 5 * Math.floor(random() * 5);
    o.resource = row.resource; o.qty = row.qty; o.side = row.side;
    o.coins = Math.max(1, Math.round(row.qty * economy.resources[row.resource].price * pct / 100 * (row.side === 'sell' ? 1.5 : .8)));
    out.push(o);
  }
  return out;
}
/** The daily slice of trade: the peddler comes every `everyDays` days and leaves after `stayDays`. */
export function dailyTrade(): void {
  const t = economy.trade;
  if (!world.progression || t.everyDays <= 0) return;
  if (world.peddlerLeft > 0) {
    world.peddlerLeft--;
    if (world.peddlerLeft === 0) { dismissPeddler(); world.offers = []; world.news.push('Le colporteur a quitté le hameau.'); }
    return;
  }
  if (Math.floor(world.tick / DAY_TICKS) % t.everyDays !== 0) return;
  world.offers = drawOffers(); world.peddlerLeft = t.stayDays;
  spawnPeddler();
  world.news.push('Un colporteur est arrivé à la porte du hameau : il propose ' + world.offers.length + ' marchés.');
}
