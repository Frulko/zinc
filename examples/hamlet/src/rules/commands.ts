import { world, Command } from '../world/world';
import { TOOL_HOUSE, TOOL_ERASE, PLACE_OK, PLACE_BLOCKED, PLACE_NO_STOCK } from '../constants';
import { applyGoal } from './goals';
import { applyTrade } from './trade';
import { applyStart, applyReturn } from './adventure';
import { checkTool, applyTool } from './build';
import { planRoad, RoadPlan, buildRoad, demolishRoad, linePath } from './roadplan';

// A command is a change of the village that comes from a decision rather than from the clock. The player's actions are data, {tick, player, type, args}:
//   place [building type, tile]            road [start, end, flip, routed] (the drag's ends: the plan is made again at its tick)
//   demolish [start, end, flip] (a line)   pause [1 or 0]
// and the campaign's: goal [k], trade [offer], adventure_start [k], adventure_return [expedition].
// The scene `submit`s them; `advance` (engine/simulate.ts) runs the queue at the tick, before stepping it, and logs what ran. Replaying the log on a village from the
// same seed (`replayAt`) rebuilds the same state, which is what lets a server check a client and a save be repaired. The simulation never changes these things
// behind the log's back. `issue` runs one at once: the simulation's own decisions (a goal reached, an expedition back) happen inside a tick.

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
  const done = c.type === 'goal' ? applyGoal(c.args[0]) : c.type === 'trade' ? applyTrade(c.args[0]) : c.type === 'adventure_start' ? applyStart(c.args[0]) : applyReturn(c.args[0]);
  return done ? PLACE_OK : PLACE_BLOCKED;
}
/** Runs a command and logs it when it changed the village. Its result is kept on it. */
export function execute(c: Command): number {
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
export function issue(type: string, a: number): boolean { return execute(command(type, [a])) === PLACE_OK; }
/** Applies recorded commands whose tick is `tick`, from index `from` of `log`: the caller steps the world and calls this before each tick. Returns the next index. */
export function replayAt(log: Command[], from: number, tick: number): number {
  let at = from;
  while (at < log.length && log[at].tick <= tick) { execute(log[at]); at++; }
  return at;
}
