import { world, Command } from '../world/world';
import { PLACE_OK } from '../constants';
import { stepWorld } from './simulate';
import { execute, SIM_PLAYER } from '../rules/commands';
import { checkSave, restore, startText, startVillage } from '../world/snapshot';
import { stateHash } from '../world/hash';

// The command log as text: what a village started from, then the player's commands with their ticks, then the tick and state hash it ended on.
//   hamlet-log 1
//   start;1234;16;<map params>;<mission>;<difficulty>;<progression>;<risks>;<unlimited>     (a new village)   or the save it was restored from (H22;...)
//   <tick> <player> <type> <args, comma separated>                                          one per command, in the order they ran
//   end <tick> <state hash>
// Replaying it from the start must give the same hash: a regression format, and the check a server makes of a client. No storage, no window.
// The simulation's own decisions (goal, adventure_return) are not written: stepping the world makes them again. As in Factorio or StarCraft, a log is
// read only by the version that wrote it (and the same economy.json); a log from a newer one is refused up front, a corrupt line by its number.

export const LOG_VERSION = 1;
const HEADER = 'hamlet-log ';
/** The arguments each command the player can log takes (undo: a multiple of three). */
const ARITY: Map<string, number> = new Map<string, number>([['place', 2], ['road', 4], ['demolish', 3], ['pause', 1], ['trade', 1], ['adventure_start', 1], ['order', 3], ['priority', 2], ['unlimited', 1], ['progression', 1], ['undo', 3]]);

/** How a replay went: it matched; the text is no log; a newer version wrote it; a line is malformed; a command was refused at its tick; the end hash differs. */
export enum LogCheck { Ok, NotALog, Future, BadLine, Refused, Desync }
/** The outcome of a replay: its check, the line it stopped at (1-based, 0 for none), a sentence, and the hash it reached against the one written. */
export class Replayed {
  check: LogCheck = LogCheck.NotALog; line: number = 0; message: string = ''; hash: number = 0; expected: number = 0;
  ok(): boolean { return this.check === LogCheck.Ok; }
}
function fail(check: LogCheck, line: number, why: string): Replayed {
  const r = new Replayed(); r.check = check; r.line = line; r.message = line > 0 ? 'Ligne ' + line + ' : ' + why : why; return r;
}
const whole = (v: string): boolean => /^-?[0-9]+$/.test(v);

/** The village's command log as text (see above). A village whose log has not started yet is described by its start as it stands. */
export function recordLog(): string {
  const lines: string[] = [HEADER + LOG_VERSION, world.origin !== '' ? world.origin : startText()];
  for (const c of world.log) if (c.player !== SIM_PLAYER) lines.push(c.tick + ' ' + c.player + ' ' + c.type + ' ' + c.args.join(','));
  lines.push('end ' + world.tick + ' ' + stateHash());
  return lines.join('\n') + '\n';
}

/** Rebuilds the village a log describes and checks it ends on the hash written. Every line is read before the village is touched: a malformed one leaves it as it was. */
export function replayLog(text: string): Replayed {
  const lines = text.split('\n').map((l: string): string => l.endsWith('\r') ? l.slice(0, -1) : l);
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  if (lines.length === 0 || !lines[0].startsWith(HEADER) || !whole(lines[0].slice(HEADER.length))) return fail(LogCheck.NotALog, 1, 'ce texte n’est pas un journal de commandes de Hameau.');
  const version = Number(lines[0].slice(HEADER.length));
  if (version > LOG_VERSION) return fail(LogCheck.Future, 1, 'ce journal vient d’une version plus récente de Hameau (' + version + ') : mettez le jeu à jour pour le rejouer.');
  if (version < 1) return fail(LogCheck.NotALog, 1, 'version de journal inconnue (' + version + ').');
  if (lines.length < 2) return fail(LogCheck.BadLine, 2, 'il manque la ligne de départ.');
  const origin = lines[1], fromSave = !origin.startsWith('start;');
  if (fromSave) { const r = checkSave(origin); if (!r.ok()) return fail(LogCheck.BadLine, 2, r.message); }
  let tick = fromSave ? Number(origin.split(';')[7]) : 0, end = -1, endHash = 0;
  const commands: Command[] = [], at: number[] = [];
  for (let n = 2; n < lines.length; n++) {
    const f = lines[n].split(' ');
    if (f[0] === 'end') {
      if (n !== lines.length - 1) return fail(LogCheck.BadLine, n + 1, 'la ligne de fin n’est pas la dernière.');
      if (f.length !== 3 || !whole(f[1]) || !whole(f[2]) || Number(f[1]) < tick) return fail(LogCheck.BadLine, n + 1, 'ligne de fin mal formée.');
      end = Number(f[1]); endHash = Number(f[2]);
      break;
    }
    const arity = ARITY.get(f.length === 4 ? f[2] : '');
    if (arity === undefined) return fail(LogCheck.BadLine, n + 1, 'commande inconnue ou mal formée : « ' + lines[n] + ' ».');
    const args = f[3].split(',');
    if (!whole(f[0]) || !whole(f[1]) || args.some((v: string): boolean => !whole(v)) || (f[2] === 'undo' ? args.length % arity !== 0 : args.length !== arity)) return fail(LogCheck.BadLine, n + 1, 'arguments mal formés : « ' + lines[n] + ' ».');
    if (Number(f[0]) < tick) return fail(LogCheck.BadLine, n + 1, 'le tick ' + f[0] + ' revient en arrière.');
    const c = new Command();
    c.tick = Number(f[0]); c.player = Number(f[1]); c.type = f[2]; c.args = args.map((v: string): number => Number(v));
    tick = c.tick; commands.push(c); at.push(n + 1);
  }
  if (end < 0) return fail(LogCheck.BadLine, lines.length + 1, 'le journal s’arrête avant sa ligne de fin.');
  if (fromSave) restore(origin);
  else { const why = startVillage(origin); if (why !== '') return fail(LogCheck.BadLine, 2, why + '.'); }
  for (let k = 0; k < commands.length; k++) {
    const c = commands[k];
    while (world.tick < c.tick) stepWorld();                   // the clock moves whether the village was paused or not: a log holds only ticks that ran
    if (execute(c) !== PLACE_OK) return fail(LogCheck.Refused, at[k], 'la commande « ' + c.type + ' » est refusée au tick ' + c.tick + ' (code ' + c.result + ').');
  }
  while (world.tick < end) stepWorld();
  const r = new Replayed();
  r.hash = stateHash(); r.expected = endHash; r.line = lines.length;
  if (r.hash === endHash) { r.check = LogCheck.Ok; return r; }
  r.check = LogCheck.Desync; r.message = 'Ligne ' + r.line + ' : le village rejoué finit sur ' + r.hash + ', le journal dit ' + endHash + '.';
  return r;
}
