// Commands to the layers: applied by zinc:mapping, followed by the media players, saved a moment later.
import * as mapping from 'zinc:mapping';
import { SETUP_FILE } from '../constants';
import { followLayerMedia } from './layerMedia';

export interface LayerCommand { address: string; numbers: number[]; strings: string[] }

const SAVE_DELAY_MS = 1000;   // a drag sends tens of commands a second: one write at its end
let savePending = false;
let onChange: () => void = () => {};

/** Who is told of each change. */
export function onLayerChange(listener: () => void): void { onChange = listener; }

function saveSoon(): void {
  if (savePending) return;
  savePending = true;
  setTimeout(() => {
    savePending = false;
    mapping.save(SETUP_FILE);
  }, SAVE_DELAY_MS);
}

/** False when zinc:mapping does not know the command or it is malformed. */
export function applyLayerCommand(command: LayerCommand): boolean {
  if (!mapping.command(command.address, command.numbers, command.strings)) return false;
  followLayerMedia();
  if (command.address !== '/save' && command.address !== '/select') {
    saveSoon();
    onChange();
  }
  return true;
}
