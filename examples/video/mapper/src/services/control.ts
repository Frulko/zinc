// One way in for every command, from the web editor or OSC: the mapper's own (/column <n> plays a column, /card <kind> [target] shows a calibration card, /hud <0|1> shows the status card), then the layers'.
import { Message, open } from 'zinc:osc/full';
import * as mapping from 'zinc:mapping';
import { OUTPUT_TARGET, showCard } from './cards';
import { applyLayerCommand, LayerCommand } from './layerCommands';
import { runAt } from './fleet';
import { fleetCommand, shareCommand } from './fleetMaster';
import { controlFilm } from './layerMedia';
import { dialectOf, translate } from './oscAliases';
import { startFeedback, subscribe, tellAll, unsubscribe } from './oscFeedback';
import { setMasterVolume, setMuted } from './sound';
import { fireCell, fireColumn, followLayerMove, followLayerRemoval, stepColumn, stopAll, stopLayer } from './show';

const FILM_WORDS: string[] = ['time', 'normalizedTime', 'speed', 'pause'];
const DIALECT_WORDS: string[] = ['mapper', 'millumin', 'resolume'];

let hudShown = true;

export function isHudShown(): boolean { return hudShown; }
export function setHudShown(shown: boolean): void { hudShown = shown; }

/** A command that came in here: the machines this one leads get it too, and all run it at the same moment. */
export function applyCommand(command: LayerCommand): boolean {
  if (command.address.startsWith('/fleet/')) return fleetCommand(command);
  // the others follow this machine's films by themselves: told to move too, they would move twice
  if (command.address === '/transport') return runTransport(command);
  if (isFilmCommand(command)) return runFilmCommand(command);
  const at = shareCommand(command);
  if (at === 0) return runCommand(command);
  runAt(at, () => { runCommand(command); });
  return true;
}

function isFilmCommand(command: LayerCommand): boolean {
  const parts = command.address.split('/');
  return parts.length === 4 && parts[1] === 'layer' && FILM_WORDS.includes(parts[3]);
}

function runFilmCommand(command: LayerCommand): boolean {
  const parts = command.address.split('/');
  return command.numbers.length > 0 && controlFilm(parseInt(parts[2]), parts[3], command.numbers[0]);
}

/** /transport play, pause, toggle or stop: every film. */
function runTransport(command: LayerCommand): boolean {
  const word = command.strings.length > 0 ? command.strings[0] : '';
  if (word === 'stop') return applyCommand({ address: '/stop', numbers: [], strings: [] });
  const value = word === 'play' ? 0 : word === 'pause' ? 1 : word === 'toggle' ? -1 : NaN;
  if (isNaN(value)) return false;
  let any = false;
  for (let layer: i32 = 0; layer < mapping.layerCount(); layer++) if (controlFilm(layer, 'pause', value)) any = true;
  return any;
}

/** Runs a command on this machine only. */
export function runCommand(command: LayerCommand): boolean {
  if (command.address === '/column') return command.numbers.length > 0 && fireColumn(Math.trunc(command.numbers[0]) as i32);
  if (command.address === '/cell') return command.numbers.length > 1 && fireCell(Math.trunc(command.numbers[0]) as i32, Math.trunc(command.numbers[1]) as i32);
  if (command.address === '/step') {
    if (command.numbers.length === 0) return false;
    stepColumn(Math.trunc(command.numbers[0]) as i32);
    return true;
  }
  if (command.address === '/stop') {
    if (command.numbers.length > 0) stopLayer(Math.trunc(command.numbers[0]) as i32);
    else stopAll();
    return true;
  }
  if (command.address === '/move' && command.numbers.length > 1) followLayerMove(Math.trunc(command.numbers[0]) as i32, Math.trunc(command.numbers[1]) as i32);
  if (command.address === '/remove' && command.numbers.length > 0) followLayerRemoval(Math.trunc(command.numbers[0]) as i32);
  if (command.address === '/hud') {
    hudShown = command.numbers.length > 0 && command.numbers[0] > 0;
    return true;
  }
  if (command.address === '/volume') return command.numbers.length > 0 && setMasterVolume(command.numbers[0]);
  if (command.address === '/mute') return command.numbers.length > 0 && setMuted(command.numbers[0] > 0);
  if (command.address === '/card') {
    if (command.strings.length === 0) return false;
    return showCard(command.strings[0], command.numbers.length > 0 ? Math.trunc(command.numbers[0]) as i32 : OUTPUT_TARGET);
  }
  return applyLayerCommand(command);
}

/** What only makes sense from someone with an address. True when it was one of these. */
function answerSender(m: Message, numbers: number[], strings: string[]): boolean {
  const asking = (strings.length === 1 && strings[0] === '?') || m.address.endsWith('/?');
  if (asking) tellAll({ host: m.from, port: m.port, dialect: dialectOf(m.address) });
  else if (m.address === '/ping') tellAll({ host: m.from, port: m.port, dialect: 'mapper' });
  else if (m.address === '/feedback/subscribe') {
    // [port] [host] [dialect]: the sender, at the port it sends from, unless it says otherwise; a name that is no dialect is a host
    const host = strings.length > 0 && !DIALECT_WORDS.includes(strings[0]) ? strings[0] : m.from;
    const dialect = strings.length > 0 && DIALECT_WORDS.includes(strings[strings.length - 1]) ? strings[strings.length - 1] : 'mapper';
    if (!subscribe(host, numbers.length > 0 ? numbers[0] as i32 : m.port, dialect)) console.warn(`mapper: cannot tell ${host}`);
  } else if (m.address === '/feedback/unsubscribe') {
    unsubscribe(strings.length > 0 ? strings[0] : m.from, numbers.length > 0 ? numbers[0] as i32 : m.port);
  } else return false;
  return true;
}

/** OSC control for desks and show software, in the mapper's words, Millumin's or Resolume's. Without it the web editor still works. */
export async function listenOsc(port: i32, feedback: string): Promise<boolean> {
  try {
    const osc = await open(port);
    osc.onAny((m: Message) => {
      const numbers: number[] = [], strings: string[] = [];
      for (const arg of m.args) {
        if (arg.type === 's') strings.push(arg.text);
        else if (arg.type === 'r') for (let shift: i32 = 24; shift >= 0; shift -= 8) numbers.push(Math.floor(arg.num / Math.pow(2, shift)) % 256);   // a colour: R, G, B, A
        else if (arg.type !== 'b' && arg.type !== 'N' && arg.type !== 't') numbers.push(arg.num);
      }
      if (answerSender(m, numbers, strings)) return;
      const commands = translate(m.address, numbers, strings);
      if (commands === null) {
        if (!applyCommand({ address: m.address, numbers, strings })) console.warn(`mapper: ignored ${m.address}`);
        return;
      }
      for (const command of commands as LayerCommand[]) if (!applyCommand(command)) console.warn(`mapper: ignored ${m.address}`);
    });
    startFeedback(osc, feedback);
    return true;
  } catch (e) {
    console.error(`mapper: no OSC control: ${e}`);
    return false;
  }
}
