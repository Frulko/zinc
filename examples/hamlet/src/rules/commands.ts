import { world, Command, recount, tileCount } from '../world/world';
import { TOOL_HOUSE, TOOL_ERASE, PLACE_OK, PLACE_BLOCKED, PLACE_NO_STOCK } from '../constants';
import { applyGoal } from './goals';
import { applyTrade } from './trade';
import { applyStart, applyReturn } from './adventure';
import { checkTool, applyTool, destroyBuilding, addBuilding } from './build';
import { planRoad, RoadPlan, buildRoad, demolishRoad, linePath, costOf, unrefund } from './roadplan';
import { setOrder } from './storage';
import { movePriority } from './labour';
import { give } from './stock';
import { economy } from '../world/economy';
import { startText } from '../world/snapshot';

// A command is a change of the village that comes from a decision rather than from the clock. The player's actions are data, {tick, player, type, args}:
//   place [building type, tile]            road [start, end, flip, routed] (the drag's ends: the plan is made again at its tick)
//   demolish [start, end, flip] (a line)   pause [1 or 0]                 undo [kind, tile, type, ...] (Ctrl+Z: what the last drag did, UNDO_* kinds)
//   order [store, resource, order]         priority [building type, places to move]          unlimited [1 or 0]        progression [1 or 0] (0: the free mode after a won scenario)
// and the campaign's: goal [k], trade [offer], adventure_start [k], adventure_return [expedition]. The simulation issues goal and adventure_return itself (player SIM_PLAYER):
// a replay steps the world, which makes them again, so engine/replay.ts writes only the others.
// The scene `submit`s them; `advance` (engine/simulate.ts) runs the queue at the tick, before stepping it, and logs what ran. Replaying the log on a village from the
// same seed (`replayAt`) rebuilds the same state, which is what lets a server check a client and a save be repaired. The simulation never changes these things
// behind the log's back. `issue` runs one at once: the simulation's own decisions (a goal reached, an expedition back) happen inside a tick.

/** The player of the commands the simulation issues itself (a goal reached, an expedition back). */
export const SIM_PLAYER = -1;
/** What an undo takes back, per tile: a road laid, a road removed, a building placed, a building removed. */
export const UNDO_ROAD = 0, UNDO_ERASE_ROAD = 1, UNDO_BUILD = 2, UNDO_ERASE_BUILDING = 3;

/** A command for the current tick. */
export function command(type: string, args: number[], player: number = 0): Command {
  const c = new Command();
  c.tick = world.tick; c.player = player; c.type = type; c.args = args;
  return c;
}

function roadPlanOf(c: Command): RoadPlan { return planRoad(c.args[0], c.args[1], c.args[2] === 1, c.args[3] === 1); }
/** The tiles of a demolition line, split in what the eraser takes one by one and the stretch of road it takes at once (never the gate, never under a building). */
function demolition(c: Command): number[][] {
  const tiles = linePath(c.args[0], c.args[1], c.args[2] === 1), roads: number[] = [], others: number[] = [];
  for (const t of tiles) if (world.road[t] !== 0 && t !== world.gate && world.build[t] < 0) roads.push(t); else others.push(t);
  return [others, roads];
}

/** Why a command cannot run now (PLACE_OK when it can): a PLACE_* code the HUD turns into a sentence (ui/Placement.ts reasonText). The execution checks
 *  again at its tick, so the scene may ask first to answer at once. */
export function validate(c: Command): number {
  if (c.type === 'place') return checkTool(TOOL_HOUSE + c.args[0], c.args[1]);
  if (c.type === 'road') {
    const plan = roadPlanOf(c);
    return plan.built > 0 ? PLACE_OK : plan.fresh.length > 0 ? PLACE_NO_STOCK : PLACE_BLOCKED;   // nothing new to lay is a blocked line
  }
  if (c.type === 'demolish') {
    const parts = demolition(c);
    return parts[1].length > 0 || parts[0].some((t: number): boolean => checkTool(TOOL_ERASE, t) === PLACE_OK) ? PLACE_OK : PLACE_BLOCKED;
  }
  if (c.type === 'pause') return c.args[0] === 1 || c.args[0] === 0 ? PLACE_OK : PLACE_BLOCKED;
  if (c.type === 'undo') {
    if (c.args.length === 0 || c.args.length % 3 !== 0) return PLACE_BLOCKED;
    for (let k = 0; k < c.args.length; k += 3) {
      const kind = c.args[k], t = c.args[k + 1], type = c.args[k + 2];
      if (kind < UNDO_ROAD || kind > UNDO_ERASE_BUILDING || t < 0 || t >= tileCount() || (kind >= UNDO_BUILD && (type < 0 || type >= economy.buildings.length))) return PLACE_BLOCKED;
    }
    return PLACE_OK;
  }
  if (c.type === 'order') { const b = world.buildings[c.args[0]]; return b !== undefined && b.alive && economy.buildings[b.type].store && c.args[1] >= 0 && c.args[1] < economy.resources.length && c.args[2] >= 0 && c.args[2] <= 2 ? PLACE_OK : PLACE_BLOCKED; }
  if (c.type === 'priority') return c.args.length === 2 && c.args[0] >= 0 && c.args[0] < economy.buildings.length ? PLACE_OK : PLACE_BLOCKED;
  if (c.type === 'unlimited' || c.type === 'progression') return c.args[0] === 1 || c.args[0] === 0 ? PLACE_OK : PLACE_BLOCKED;
  if (c.type === 'goal' || c.type === 'trade' || c.type === 'adventure_start' || c.type === 'adventure_return') return PLACE_OK;   // their own rules decide in apply* below
  return PLACE_BLOCKED;
}

/** Runs a command now: its result is PLACE_OK, or the reason it was refused (then nothing changed). */
function run(c: Command): number {
  const code = validate(c);
  if (code !== PLACE_OK) return code;
  if (c.type === 'place') return applyTool(TOOL_HOUSE + c.args[0], c.args[1]);
  if (c.type === 'road') { const plan = roadPlanOf(c); buildRoad(plan.fresh.slice(0, plan.built)); return PLACE_OK; }
  if (c.type === 'demolish') {
    const parts = demolition(c);
    for (const t of parts[0]) applyTool(TOOL_ERASE, t);
    demolishRoad(parts[1]);
    return PLACE_OK;
  }
  if (c.type === 'pause') { world.paused = c.args[0] === 1; return PLACE_OK; }
  if (c.type === 'undo') { undoTiles(c.args); return PLACE_OK; }
  if (c.type === 'order') return setOrder(c.args[0], c.args[1], c.args[2]) ? PLACE_OK : PLACE_BLOCKED;
  if (c.type === 'priority') return movePriority(c.args[0], c.args[1]) >= 0 ? PLACE_OK : PLACE_BLOCKED;
  if (c.type === 'unlimited') { world.unlimited = c.args[0] === 1; world.saveDirty = true; return PLACE_OK; }
  if (c.type === 'progression') { world.progression = c.args[0] === 1; world.saveDirty = true; return PLACE_OK; }
  const done = c.type === 'goal' ? applyGoal(c.args[0]) : c.type === 'trade' ? applyTrade(c.args[0]) : c.type === 'adventure_start' ? applyStart(c.args[0]) : applyReturn(c.args[0]);
  return done ? PLACE_OK : PLACE_BLOCKED;
}
/** Takes back what a drag did, last tile first: roads laid are lifted and paid back whole (a felled tree stays felled), roads removed are laid again
 *  and their refund taken back, a building placed is razed and its cost given back, one removed stands again. */
function undoTiles(args: number[]): void {
  const paid: number[] = [], taken: number[] = [];
  world.netRev++;
  for (let k = args.length - 3; k >= 0; k -= 3) {
    const kind = args[k], t = args[k + 1], type = args[k + 2];
    if (kind === UNDO_ROAD) { world.road[t] = 0; paid.push(t); }
    else if (kind === UNDO_ERASE_ROAD) { world.road[t] = 1; taken.push(t); }
    else if (kind === UNDO_BUILD) {
      if (world.build[t] >= 0) destroyBuilding(world.build[t]);
      const cost = economy.buildings[type].cost;
      for (let r = 0; r < cost.length; r++) if (cost[r] > 0) give(r, cost[r]);
    } else if (world.build[t] < 0) addBuilding(type, t);
  }
  const back = costOf(paid);
  for (let r = 0; r < back.length; r++) if (back[r] > 0) give(r, back[r]);
  unrefund(taken);
  recount(); world.revision++; world.saveDirty = true;
}
/** Runs a command and logs it when it changed the village. Its result is kept on it. The first command of a new village notes the start it was made from (the log's origin). */
export function execute(c: Command): number {
  if (world.origin === '') world.origin = startText();
  c.result = run(c);
  if (c.result === PLACE_OK) world.log.push(c);
  return c.result;
}
/** Queues a command; `advance` runs it at its tick. */
export function submit(c: Command): void { world.queue.push(c); }
/** Runs the queued commands due by now, in the order they came (one player here: a server orders by tick, then player, then arrival). */
export function runDue(): void {
  let k = 0;
  while (k < world.queue.length) {
    if (world.queue[k].tick > world.tick) { k++; continue; }
    const c = world.queue[k];
    world.queue.splice(k, 1);
    execute(c);
  }
}
/** A decision of the simulation itself, run and logged at once. False (and nothing logged) when it was refused. */
export function issue(type: string, a: number): boolean { return execute(command(type, [a], SIM_PLAYER)) === PLACE_OK; }
/** Applies recorded commands whose tick is `tick`, from index `from` of `log`: the caller steps the world and calls this before each tick. Returns the next index. */
export function replayAt(log: Command[], from: number, tick: number): number {
  let at = from;
  while (at < log.length && log[at].tick <= tick) { execute(log[at]); at++; }
  return at;
}
