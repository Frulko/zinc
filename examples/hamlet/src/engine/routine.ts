import { settings } from '../settings';
import { WALK_SPEED, ST_IDLE, ST_STROLL, ST_SEEK, ST_SLEEP, ST_HOME, ST_FREE } from '../constants';
import { world, Person, random, tileIndex, tileX, tileY } from '../world/world';
import { economy } from '../world/economy';
import { isNight, FREE_PLACES, SLEEP_RECOVERY } from '../rules/needs';
import { planPath, walk } from './path';

// The daily round of a resident: work by day, home to sleep at night, free time at the market, the well or the tavern. Work itself stays in villagers.ts.
const speed = (): number => WALK_SPEED * settings.walkSpeed;
const homeTile = (p: Person): number => { const h = world.buildings[p.home]; return h === undefined || !h.alive ? -1 : tileIndex(h.i, h.j); };
/** A sleeper beside his house is indoors: he is not drawn nor picked. */
export function sleepsIndoors(p: Person): boolean {
  const t = homeTile(p);
  return p.state === ST_SLEEP && t >= 0 && Math.abs(tileX(t) - p.x) + Math.abs(tileY(t) - p.y) < 4;
}
/** Nobody is carrying or claiming anything: the moment a person may stop for the night. */
function canRest(p: Person): boolean {
  if (p.state === ST_IDLE || p.state === ST_STROLL || p.state === ST_FREE) return true;
  return p.state === ST_SEEK && p.carry === 0 && p.load === 0 && p.target < 0;
}
function goHome(p: Person): boolean {
  const t = homeTile(p);
  if (t < 0) return false;
  p.state = planPath(p, t) ? ST_HOME : ST_SLEEP;                // no way home: he sleeps where he stands
  return true;
}
/** True when the round took the person this tick (asleep, walking home, walking to a free-time place); false: the normal behaviour runs. Also where tiredness builds up. */
export function routine(p: Person, dt: number): boolean {
  if (p.state === ST_SLEEP) {
    p.fatigue = Math.max(0, p.fatigue - dt * SLEEP_RECOVERY);
    if (!isNight()) { p.state = p.job >= 0 ? ST_SEEK : ST_IDLE; p.timer = random() * 2; p.path = []; p.step = 0; }
    return true;
  }
  p.fatigue = Math.min(100, p.fatigue + dt * (p.job >= 0 ? 5 : 1.5));
  if (isNight() && canRest(p) && (world.tick + p.home * 3 + p.hair) % 16 === 0 && goHome(p)) return true;
  if (p.state === ST_HOME) {
    if (walk(p, dt, speed())) { p.path = []; p.step = 0; p.state = ST_SLEEP; }
    return true;
  }
  if (p.state === ST_FREE) {
    if (walk(p, dt, speed() * .6)) { p.state = ST_IDLE; p.timer = 3 + random() * 3; p.fun = 2; }
    return true;
  }
  return false;
}
/** An idle resident in daylight may walk to the nearest market, well or tavern: a visit lifts his mood for a day or two. */
export function freeTime(p: Person): boolean {
  if (isNight() || random() < .5) return false;
  const t = homeTile(p);
  if (t < 0) return false;
  let best = -1, bestD = 14;
  for (const b of world.buildings) {
    if (!b.alive || FREE_PLACES.indexOf(economy.buildings[b.type].id) < 0) continue;
    const bt = tileIndex(b.i, b.j), g = Math.abs(tileX(bt) - tileX(t)) + Math.abs(tileY(bt) - tileY(t));
    if (g < bestD) { bestD = g; best = bt; }
  }
  if (best < 0 || !planPath(p, best)) return false;
  p.state = ST_FREE;
  return true;
}
