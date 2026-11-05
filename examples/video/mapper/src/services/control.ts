// One way in for every command, from the web editor or OSC: the mapper's own (/column <n> plays a column, /card <kind> [target] shows a calibration card, /hud <0|1> shows the status card), then the layers'.
import { listen, OscMessage } from 'zinc:osc';
import { OUTPUT_TARGET, showCard } from './cards';
import { applyLayerCommand, LayerCommand } from './layerCommands';
import { runAt } from './fleet';
import { fleetCommand, shareCommand } from './fleetMaster';
import { setMasterVolume, setMuted } from './sound';
import { fireCell, fireColumn, followLayerMove, followLayerRemoval, stepColumn, stopAll, stopLayer } from './show';

let hudShown = true;

export function isHudShown(): boolean { return hudShown; }
export function setHudShown(shown: boolean): void { hudShown = shown; }

/** A command that came in here: the machines this one leads get it too, and all run it at the same moment. */
export function applyCommand(command: LayerCommand): boolean {
  if (command.address.startsWith('/fleet/')) return fleetCommand(command);
  const at = shareCommand(command);
  if (at === 0) return runCommand(command);
  runAt(at, () => { runCommand(command); });
  return true;
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

/** OSC control for desks and show software. Returns false when another program holds the port: the web editor still works. */
export function listenOsc(port: i32): boolean {
  try {
    listen(port, (m: OscMessage) => {
      if (!applyCommand({ address: m.address, numbers: m.numbers, strings: m.strings })) console.warn(`mapper: ignored ${m.address}`);
    });
    return true;
  } catch (e) {
    console.error(`mapper: no OSC control: ${e}`);
    return false;
  }
}
