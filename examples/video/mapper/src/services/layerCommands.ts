import { projectFile } from './projectPaths';
// Commands to the layers: applied by zinc:mapping, followed by the media players, saved a moment later.
import * as mapping from 'zinc:mapping';
import * as fs from 'zinc:fs';
import { SETUP_FILE } from '../constants';
import { followLayerMedia } from './layerMedia';

export interface LayerCommand { address: string; numbers: number[]; strings: string[] }

const SAVE_DELAY_MS = 1000;   // a drag sends tens of commands a second: one write at its end
enum SavePhase { Idle, Pending }
let savePhase = SavePhase.Idle;
let saveTimer: i32 = 0;
function transitionSave(next: SavePhase): void { savePhase = next; }
let onChange: () => void = () => {};

/** Who is told of each change. */
export function onLayerChange(listener: () => void): void { onChange = listener; }

/** Flush before switching project paths so a pending drag cannot write into another project. */
export function flushLayerSave(): void {
  if (savePhase === SavePhase.Pending) clearTimeout(saveTimer);
  transitionSave(SavePhase.Idle);
  const target = projectFile(SETUP_FILE);
  fs.writeText(`${target}.part`, mapping.toJson());
  fs.rename(`${target}.part`, target);
}

function saveSoon(): void {
  if (savePhase === SavePhase.Pending) return;
  transitionSave(SavePhase.Pending);
  saveTimer = setTimeout(() => {
    transitionSave(SavePhase.Idle);
    flushLayerSave();
  }, SAVE_DELAY_MS);
}

/** False when zinc:mapping does not know the command or it is malformed. */
export function applyLayerCommand(command: LayerCommand): boolean {
  if (command.address === '/save') {
    const name = command.strings.length > 0 ? command.strings[0] : SETUP_FILE;
    if (!mapping.isFileName(name)) return false;
    if (name === SETUP_FILE) flushLayerSave();
    else if (!mapping.save(projectFile(name))) return false;
    return true;
  }
  if (command.address === '/load') {
    const name = command.strings.length > 0 ? command.strings[0] : SETUP_FILE;
    if (!mapping.isFileName(name) || !mapping.load(projectFile(name))) return false;
    followLayerMedia();
    onChange();
    return true;
  }
  if (!mapping.command(command.address, command.numbers, command.strings)) return false;
  followLayerMedia();
  if (command.address !== '/save' && command.address !== '/select') {
    saveSoon();
    onChange();
  }
  return true;
}
