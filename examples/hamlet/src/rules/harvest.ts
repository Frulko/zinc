import { world, random } from '../world/world';
import { economy, Harvest, BuildingDef } from '../world/economy';
import { season } from './season';

// Harvests: what a gathering cycle takes, brings and risks, read from the `harvest` blocks of economy.json (per resource, per variant: a tree species, a doe or a stag).
// The job engine (engine/villagers.ts) asks here when a cycle starts and when it ends; the views word the same numbers. The model is Augustus's: a source has a nominal
// production, an efficiency percent scales it (here the season and a tool in the stores), and the fraction of a unit is rolled with the simulation's generator.

export const TAU = Math.PI * 2;
/** The swing of a worker is drawn from `phase * BLOW_ANGLE`; the axe is down once per TAU of that angle. */
export const BLOW_ANGLE = 4.2;
/** A blow every BLOW_PERIOD seconds, rounded to a whole number per cycle: a longer harvest means more blows, never a slower swing. */
export const BLOW_PERIOD = .55;
/** Units gathered so far per resource since the program started (a counter for the tests and the statistics; not part of the saved village). */
export const harvested: number[] = [];
export const harvestedOf = (k: number): number => k < harvested.length ? harvested[k] : 0;

/** The harvest of resource k for a variant (-1 or out of range: the resource's own), or null when the resource has none. */
export function harvestFor(k: number, variant: number): Harvest | null {
  const r = economy.resources[k];
  if (r.harvest === null) return null;
  return variant >= 0 && variant < r.variants.length ? r.variants[variant] : r.harvest;
}
/** The first output of a building that has a harvest (-1: none): the one whose time and variant rule a cycle. */
export function sourceOf(def: BuildingDef): number {
  for (let k = 0; k < def.outputs.length; k++) if (def.outputs[k] > 0 && economy.resources[k].harvest !== null) return k;
  return -1;
}
/** Efficiency in percent of a harvest right now: its percent, the season's, and the tool's bonus when one stands in the stores. */
export function efficiency(h: Harvest): number {
  let e = h.percent * h.seasons[season()] / 100;
  if (h.tool >= 0 && world.stock[h.tool] >= 1) e *= 1 + h.toolBonus / 100;
  return e;
}
/** Units a successful cycle brings on average. */
export function meanUnits(h: Harvest): number { return h.units * efficiency(h) / 100; }
/** Seconds of one cycle: the harvest's time, or the building's own when the harvest gives none. */
export function cycleSeconds(h: Harvest | null, def: BuildingDef): number { return h !== null && h.time > 0 ? h.time : def.seconds; }
/** True when the cycle succeeds (a fish bites, the arrow hits). Rolls the generator only when it can fail. */
export function succeeds(h: Harvest): boolean { return h.chance >= 100 || random() * 100 < h.chance; }
/** True when the cycle uses up one load of the deposit. */
export function depletes(h: Harvest): boolean { return h.depletion >= 100 || random() * 100 < h.depletion; }
/** Units of resource k that this cycle brings: the whole part of the mean, plus one with the fraction's probability. */
export function rollUnits(k: number, h: Harvest): number {
  const mean = meanUnits(h), whole = Math.floor(mean);
  const n = whole + (mean > whole && random() < mean - whole ? 1 : 0);
  while (harvested.length < economy.resources.length) harvested.push(0);
  harvested[k] += n;
  return n;
}
/** Blows of one cycle of `seconds`, and the rate at which a worker's phase must run so that they fall evenly (half a gap after the start, one gap before the end). */
export function blowsOf(seconds: number): number { return Math.max(1, Math.round(seconds / BLOW_PERIOD)); }
export function swingRate(seconds: number): number { return seconds > 0 ? blowsOf(seconds) * TAU / BLOW_ANGLE / seconds : 0; }

const SEASONS: string[] = ['printemps', 'été', 'automne', 'hiver'];
const trim = (n: number): string => String(Math.round(n * 10) / 10);
/** "2,6 s · 1 Bois · 90 %": a cycle, what it brings now and its efficiency (for the info window and the tooltips). `variant` -1 is the resource's own. */
export function harvestLine(k: number, variant: number, def: BuildingDef | null): string {
  const h = harvestFor(k, variant);
  if (h === null) return '';
  const secs = def === null ? h.time : cycleSeconds(h, def), parts: string[] = [];
  if (secs > 0) parts.push(trim(secs) + ' s');
  parts.push(trim(meanUnits(h)) + ' ' + economy.resources[k].label.toLowerCase());
  parts.push(trim(efficiency(h)) + ' %');
  if (h.chance < 100) parts.push('réussite ' + trim(h.chance) + ' %');
  return parts.join(' · ');
}
/** The long form for a tooltip: one line for the resource and one per variant, then what raises or lowers it. */
export function harvestLines(k: number, def: BuildingDef | null): string[] {
  const r = economy.resources[k], lines: string[] = [];
  if (r.harvest === null) return lines;
  if (r.variants.length === 0) lines.push('Récolte : ' + harvestLine(k, -1, def));
  for (let v = 0; v < r.variants.length; v++) lines.push((r.variants[v].label !== '' ? r.variants[v].label : 'Variante ' + (v + 1)) + ' : ' + harvestLine(k, v, def));
  const h = r.harvest;
  lines.push('Saisons : ' + h.seasons.map((p: number, s: number): string => SEASONS[s] + ' ' + p + ' %').join(', '));
  if (h.tool >= 0) lines.push('Avec ' + economy.resources[h.tool].label.toLowerCase() + ' en réserve : +' + h.toolBonus + ' %');
  return lines;
}
