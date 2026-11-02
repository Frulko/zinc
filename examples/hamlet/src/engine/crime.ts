import { HOUSE, ROLE_ROBBER, ROLE_RIOTER, ROLE_WATCHMAN, ST_RAID, ST_WRECK, ST_FLEE, WALK_SPEED, DAY_TICKS, TILE } from '../constants';
import { settings } from '../settings';
import { world, Person, Alert, random, recount, tileI, tileJ, tileIndex, tileAt, tileX, tileY } from '../world/world';
import { economy } from '../world/economy';
import { level } from '../rules/difficulty';
import { planPath, walk } from './path';
import { goalOf } from './network';

// Public order: robbers and rioters. They are walkers on the roads, kept in world.crime.outlaws (no villagers: not counted, not saved, not in the mood).
// A robber comes through the gate for a building that holds goods (a theft counter that passed its threshold sends one: engine/risk.ts; so does a low peace), takes a few units of the
// dearest and runs back; a watchman who passes within two tiles catches him and the goods go back. Rioters come only when the mood is very low and the peace poor: they smash one
// building (its collapse counter jumps) and leave. The peace rating (0..100, daily) is what the Humeur advisor and the debug window show; rules in economy.json "risks.peace".
// Everything is gated by world.risks and scaled by the difficulty's risk pace; the only random draws are the spawn chance and the target of a riot, so a seed replays.

export const isOutlaw = (role: number): boolean => role === ROLE_ROBBER || role === ROLE_RIOTER;
const isRuin = (type: number): boolean => type === economy.risk.ruin;
const label = (type: number): string => economy.buildings[type].label;
const CATCH = 2.5 * TILE;                      // a watchman this close (world units) stops an outlaw
const RAMPAGE = 5;                              // seconds the rioters spend on a building
const day = (): number => Math.floor(world.tick / DAY_TICKS);
function raise(kind: string, text: string, tile: number): void { const a = new Alert(); a.kind = kind; a.text = text; a.tile = tile; world.alerts.push(a); }
const count = (role: number): number => world.crime.outlaws.filter((p: Person): boolean => p.role === role).length;
const population = (): number => { let n = 0; for (const b of world.buildings) if (b.alive && b.type === HOUSE) n += b.residents; return n; };

/** Share (0..1) of the occupied houses that no watchman has passed lately; 1 when the village has no guard post at all. */
export function watchGap(): number {
  const k = economy.serviceOf('watch');
  let houses = 0, bare = 0, post = false;
  for (const b of world.buildings) {
    if (!b.alive) continue;
    const s = economy.buildings[b.type].service;
    if (k >= 0 && s !== null && s.service === k) post = true;
    if (b.type === HOUSE && b.residents > 0) { houses++; if (k < 0 || b.cover[k] === 0) bare++; }
  }
  return houses === 0 ? 0 : !post ? 1 : bare / houses;
}
/** The peace rating from the mood, the jobless, the watch gap and the heat of recent crimes. */
export function computePeace(): number {
  const r = economy.risk.peace;
  if (!world.risks) return 100;
  const guarded = population() >= economy.risk.minPopulation ? watchGap() * r.gap : 0;
  const unrest = Math.max(0, r.moodFloor - world.mood) * 1.5 + Math.max(0, world.jobless - r.joblessFloor) * .7 + guarded + world.crime.heat;
  return Math.max(0, Math.min(100, Math.round(100 - unrest)));
}
/** Why the peace is what it is, most weighty first, for the advisor ("pas de guet", "chômage"...). */
export function peaceReasons(): string[] {
  const r = economy.risk.peace, out: string[] = [];
  if (!world.risks) return out;
  if (world.mood < r.moodFloor) out.push('humeur basse');
  if (world.jobless > r.joblessFloor) out.push('chômage');
  if (population() >= economy.risk.minPopulation && watchGap() > .3) out.push(watchGap() >= 1 ? 'aucun guet' : 'guet trop rare');
  if (world.crime.heat >= 5) out.push('crimes récents');
  return out;
}

/** The goods a building holds that nobody promised, as coins at the resources' prices. */
function worth(id: number): number {
  const b = world.buildings[id];
  let v = 0;
  for (let k = 0; k < b.stock.length; k++) v += Math.max(0, b.stock[k] - b.reserved[k]) * economy.resources[k].price;
  return v;
}
/** The richest building a robber could hit (the one with the largest worth, the lowest id on a tie), or -1. */
function richest(): number {
  let best = -1, most = 0;
  for (let id = 0; id < world.buildings.length; id++) {
    const b = world.buildings[id];
    if (!b.alive || isRuin(b.type) || b.fixed) continue;       // the hall is guarded by its own people
    const v = worth(id);
    if (v > most) { most = v; best = id; }
  }
  return best;
}
function outlaw(role: number, target: number): boolean {
  const gate = world.gate + 1, p = new Person();
  p.x = tileX(gate); p.y = tileY(gate); p.yaw = random() * 6.28; p.phase = random() * 6; p.hair = Math.floor(random() * 4);
  p.role = role; p.home = -1; p.job = -1; p.state = ST_RAID; p.target = target; p.timer = 0; p.want = 0;
  if (!planPath(p, tileIndex(world.buildings[target].i, world.buildings[target].j))) return false;
  world.crime.outlaws.push(p);
  return true;
}
/** Sends a robber for the building (a theft counter ran out, or the peace is poor). False when there is no road to it: the caller steals at once. */
export function sendRobber(id: number): boolean {
  if (worth(id) < 1) return true;                                    // nothing to take: nothing happens
  if (!outlaw(ROLE_ROBBER, id)) return false;
  world.crime.lastRobbery = day();
  raise('robber', 'Un voleur est entré par la porte : il en veut à ' + label(world.buildings[id].type).toLowerCase() + '.', tileIndex(world.buildings[id].i, world.buildings[id].j));
  return true;
}

/** The daily slice of public order: the heat fades, the peace is rated, and below the calm line a robber may come; a riot needs the mood to be very low as well. */
export function dailyCrime(): void {
  const c = world.crime, r = economy.risk, pr = r.peace;
  c.heat = c.heat * (100 - pr.fade) / 100;
  c.peace = computePeace();
  if (!world.risks || r.ruin < 0 || population() < r.minPopulation) return;
  const pace = level().risk / 100, today = day();
  if (pace <= 0) return;
  if (c.peace < pr.riotPeace && world.mood < pr.riotMood && today - c.lastRiot >= Math.ceil(pr.riotEvery / pace) && count(ROLE_RIOTER) === 0) {
    const pool: number[] = [];
    for (let id = 0; id < world.buildings.length; id++) { const b = world.buildings[id]; if (b.alive && !b.fixed && !isRuin(b.type) && b.type !== HOUSE) pool.push(id); }
    if (pool.length > 0 && outlaw(ROLE_RIOTER, pool[Math.floor(random() * pool.length)])) {
      c.lastRiot = today; c.riots++;
      world.news.push('Émeute : des habitants en colère marchent sur le hameau. Il faut du guet.');
    }
    return;
  }
  if (c.peace < pr.calm && count(ROLE_ROBBER) < 1 + Math.floor(population() / 40) && today - c.lastRobbery >= Math.ceil(pr.robberEvery / pace) && random() < (pr.calm - c.peace) / 100 * pace) {
    const id = richest();
    if (id >= 0 && sendRobber(id)) return;
  }
}

/** A robber takes up to `risks.theft` units of the dearest goods the building holds free. */
function rob(p: Person): void {
  const b = world.buildings[p.target];
  if (b === undefined || !b.alive) return;
  let best = -1;
  for (let k = 0; k < b.stock.length; k++) if (b.stock[k] - b.reserved[k] >= 1 && (best < 0 || economy.resources[k].price > economy.resources[best].price)) best = k;
  if (best < 0) return;
  const n = Math.min(economy.risk.theft, Math.floor(b.stock[best] - b.reserved[best]));
  b.stock[best] -= n; recount(); world.saveDirty = true;
  p.carry = best + 1; p.load = n; p.res = best; p.src = p.target;
  raise('theft', 'Vol : ' + n + ' ' + economy.resources[best].label.toLowerCase() + ' dérobé' + (n > 1 ? 's' : '') + ' (' + label(b.type) + ').', tileIndex(b.i, b.j));
}
/** The rioters smash their building: its collapse counter jumps (the next daily check brings it down when it passes the line). */
function wreck(p: Person): void {
  const b = world.buildings[p.target];
  if (b === undefined || !b.alive || isRuin(b.type)) return;
  b.damage += economy.risk.collapseAt * economy.risk.peace.riotDamage / 100; world.saveDirty = true;
  raise('riot', 'Émeute : ' + label(b.type) + ' est saccagé.', tileIndex(b.i, b.j));
}
function flee(p: Person, fresh: boolean = true): void { p.state = ST_FLEE; if (fresh) p.want = 0; if (!planPath(p, world.gate)) { p.path = []; p.step = 0; } }
function arrested(p: Person): void {
  const c = world.crime;
  if (p.role === ROLE_ROBBER) {
    if (p.load > 0 && p.src >= 0 && world.buildings[p.src] !== undefined && world.buildings[p.src].alive) { world.buildings[p.src].stock[p.res] += p.load; recount(); }
    world.news.push('Le guet a arrêté un voleur' + (p.load > 0 ? ' : le butin est rendu.' : '.'));
  } else world.news.push('Le guet a dispersé les émeutiers.');
  c.caught++; c.heat = Math.max(0, c.heat - 5);
}
function escaped(p: Person): void {
  const c = world.crime;
  if (p.role === ROLE_ROBBER) {
    c.heat += economy.risk.peace.theftHeat; c.robbed++;
    if (p.load > 0) world.news.push('Un voleur s’est enfui avec ' + p.load + ' ' + economy.resources[p.res].label.toLowerCase() + '.');
  } else world.news.push('Les émeutiers se sont dispersés.');
}
/** True when a watchman is close enough to stop him. */
function watched(p: Person): boolean {
  for (const q of world.people) if (q.role === ROLE_WATCHMAN) { const dx = q.x - p.x, dy = q.y - p.y; if (dx * dx + dy * dy <= CATCH * CATCH) return true; }
  return false;
}
/** One tick of every outlaw: walk, rob or wreck on arrival, run, vanish at the gate or in the watchman's hands. */
export function updateOutlaws(dt: number): void {
  const list = world.crime.outlaws;
  if (list.length === 0) return;
  const keep: Person[] = [], speed = WALK_SPEED * settings.walkSpeed * 1.1;
  for (const p of list) {
    if (watched(p)) { arrested(p); continue; }
    let gone = false;
    if (p.state === ST_RAID) {
      if (walk(p, dt, speed)) {
        const b = world.buildings[p.target], t = tileAt(p.x, p.y);
        const near = b !== undefined && b.alive && t >= 0 && Math.max(b.i - tileI(t), tileI(t) - (b.i + b.w - 1), 0) + Math.max(b.j - tileJ(t), tileJ(t) - (b.j + b.h - 1), 0) <= 1;
        if (near) { if (p.role === ROLE_ROBBER) { rob(p); flee(p); } else { p.state = ST_WRECK; p.timer = RAMPAGE; } }
        else if (++p.want > 3 || b === undefined || !b.alive || !planPath(p, goalOf(b))) gone = true;
      }
    } else if (p.state === ST_WRECK) {
      p.timer -= dt;
      if (p.timer <= 0) { wreck(p); world.crime.heat += economy.risk.peace.riotHeat; flee(p); }
    } else if (walk(p, dt, speed)) {
      const t = tileAt(p.x, p.y);
      if (t < 0 || Math.abs(tileI(t) - tileI(world.gate)) + Math.abs(tileJ(t) - tileJ(world.gate)) <= 2 || ++p.want > 3) { escaped(p); gone = true; }
      else flee(p, false);
    }
    if (!gone) keep.push(p);
  }
  world.crime.outlaws = keep;
}

/** The peace line for the screens: the rating, why it is low, and the tally of the village's crimes. */
export function peaceText(): string {
  if (!world.risks) return 'Paix : sans risques dans ce hameau.';
  const c = world.crime, why = peaceReasons();
  return 'Paix : ' + c.peace + ' %' + (why.length > 0 ? ' (' + why.join(', ') + ')' : '') + ' · ' + c.robbed + ' vol(s), ' + c.caught + ' arrêté(s), ' + c.riots + ' émeute(s)';
}
