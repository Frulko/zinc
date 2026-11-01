import { world, Command } from '../world/world';
import { applyGoal } from './goals';
import { applyTrade } from './trade';

// A command is a change of the village that comes from a decision (a goal's reward, a trade, an adventure) rather than from the clock: it is applied through
// `issue`, which records it with its tick. Replaying the log on a village from the same seed (`replay`) rebuilds the same state, which is what lets a server
// check a client and a save be repaired. The simulation never changes these things behind the log's back.

/** Runs a command now and records it. False (and nothing recorded) when it was refused. */
export function execute(c: Command): boolean {
  if (c.kind === 'goal') return applyGoal(c.a);
  if (c.kind === 'trade') return applyTrade(c.a);
  return false;
}
export function issue(kind: string, a: number, b: number = 0): boolean {
  const c = new Command();
  c.tick = world.tick; c.kind = kind; c.a = a; c.b = b;
  if (!execute(c)) return false;
  world.log.push(c);
  return true;
}
/** Applies recorded commands whose tick is `tick`, from index `from` of `log`: the caller steps the world and calls this before each tick. Returns the next index. */
export function replayAt(log: Command[], from: number, tick: number): number {
  let at = from;
  while (at < log.length && log[at].tick <= tick) { execute(log[at]); world.log.push(log[at]); at++; }
  return at;
}
