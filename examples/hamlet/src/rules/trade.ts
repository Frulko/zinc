import { world, Offer } from '../world/world';
import { economy } from '../world/economy';
import { give, take } from './stock';

// The peddler's offers in plain words and the trade command. A village buys from him (`sell`) with coins, or sells to him (`buy`) for coins.

/** "Le colporteur vend 4 Pain pour 18 Pièces" / "... achète 6 Planches pour 7 Pièces". */
export function offerText(o: Offer): string {
  const verb = o.side === 'sell' ? 'vend' : 'achète', coin = economy.resources[economy.trade.coin].label;
  return 'Le colporteur ' + verb + ' ' + o.qty + ' ' + economy.resources[o.resource].label + ' pour ' + o.coins + ' ' + coin + (o.taken ? ' (conclu)' : '');
}
/** The offers as lines for a small panel (nothing when the peddler is away). */
export function offerLines(): string[] { return world.peddlerLeft > 0 ? world.offers.map(offerText) : []; }
/** Can the village take this offer now: the peddler is here, the line is open, and it holds the coins (or the goods). */
export function canTrade(k: number): boolean {
  if (world.peddlerLeft <= 0 || k < 0 || k >= world.offers.length || world.offers[k].taken) return false;
  const o = world.offers[k];
  return o.side === 'sell' ? world.stock[economy.trade.coin] >= o.coins : world.stock[o.resource] >= o.qty;
}
/** The `trade` command: carries the offer out. False when it cannot be. */
export function applyTrade(k: number): boolean {
  if (!canTrade(k)) return false;
  const o = world.offers[k], coin = economy.trade.coin;
  if (o.side === 'sell') { take(coin, o.coins); give(o.resource, o.qty); } else { take(o.resource, o.qty); give(coin, o.coins); }
  o.taken = true; world.saveDirty = true;
  return true;
}
