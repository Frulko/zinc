// One way in for every command, from the web editor or OSC: the mapper's own (/column <n> plays a column, /hud <0|1> shows the status card), then the layers'.
import { listen, OscMessage } from 'zinc:osc';
import { applyLayerCommand, LayerCommand } from './layerCommands';
import { fireColumn } from './show';

let hudShown = true;

export function isHudShown(): boolean { return hudShown; }
export function setHudShown(shown: boolean): void { hudShown = shown; }

export function applyCommand(command: LayerCommand): boolean {
  if (command.address === '/column') return command.numbers.length > 0 && fireColumn(Math.trunc(command.numbers[0]) as i32);
  if (command.address === '/hud') {
    hudShown = command.numbers.length > 0 && command.numbers[0] > 0;
    return true;
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
