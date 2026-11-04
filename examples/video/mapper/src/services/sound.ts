// The master volume, over each layer's own: it belongs to the device (the room, the amplifier), so a scene does not change it and a restart keeps it.
import * as fs from 'zinc:fs';
import * as mapping from 'zinc:mapping';
import { VOLUME_FILE } from '../constants';

let masterVolume = 1;
let muted = false;

function apply(): void {
  mapping.command('/master', [muted ? 0 : masterVolume], []);
}

function save(): void {
  const coming = `${VOLUME_FILE}.part`;
  fs.writeText(coming, `{"volume":${masterVolume},"muted":${muted}}`);
  fs.rename(coming, VOLUME_FILE);
}

export function soundJson(): string { return `"volume":${masterVolume},"muted":${muted}`; }

export function loadVolume(): void {
  if (fs.exists(VOLUME_FILE)) {
    try {
      const saved = JSON.parse(fs.readText(VOLUME_FILE));
      masterVolume = saved.volume as number;
      muted = saved.muted as boolean;
    } catch (e) {
      console.error(`mapper: ${VOLUME_FILE} is not readable, the volume stays at its maximum (${e})`);
    }
  }
  apply();
}

export function setMasterVolume(volume: number): boolean {
  if (!(volume >= 0 && volume <= 1)) return false;
  masterVolume = volume;
  apply();
  save();
  return true;
}

export function setMuted(on: boolean): boolean {
  muted = on;
  apply();
  save();
  return true;
}
