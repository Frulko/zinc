import * as storage from 'zinc:storage';
import { settings } from '../settings';
import { ui, SPEEDS } from './state';
import { kit, setSkin, winExport, winImport } from './kit';
import { muted, toggleSound } from '../audio';

// The player's options, kept between runs in their own storage key (the village has its own save). Developer-panel values are not saved.
const KEY = 'hamlet:prefs';
/** The campaign progress: the ids of the missions won, kept between runs with the options (the village itself carries its mission id). */
const won: string[] = [];
export function missionWon(id: string): boolean { return won.indexOf(id) >= 0; }
export function markMissionWon(id: string): void { if (id !== '' && won.indexOf(id) < 0) { won.push(id); savePrefs(); } }
export function loadPrefs(): void {
  let text = '';
  try { text = storage.get(KEY); } catch (error) { return; }
  if (text === '') return;
  let data: any = null;
  try { data = JSON.parse(text); } catch (error) { return; }
  if (data === null) return;
  if (typeof data.speed === 'number' && data.speed >= 0 && data.speed < SPEEDS.length) { ui.speed = data.speed as number; settings.simSpeed = SPEEDS[ui.speed]; }
  if (typeof data.skin === 'number') setSkin(data.skin as number);
  if (typeof data.edgePan === 'boolean') settings.edgePan = data.edgePan as boolean;
  if (typeof data.hints === 'boolean') settings.hints = data.hints as boolean;
  if (typeof data.fx === 'boolean') settings.fx = data.fx as boolean;
  if (typeof data.thoughts === 'boolean') settings.thoughts = data.thoughts as boolean;
  if (typeof data.ambience === 'number') settings.ambienceVolume = Math.max(0, Math.min(1, data.ambience as number));
  if (typeof data.sfx === 'number') settings.sfxVolume = Math.max(0, Math.min(1, data.sfx as number));
  if (typeof data.guide === 'boolean') ui.guide = data.guide as boolean;
  if (Array.isArray(data.missions)) for (const id of data.missions as any[]) if (typeof id === 'string' && won.indexOf(id as string) < 0) won.push(id as string);
  winImport(data.windows);
  if (typeof data.mute === 'boolean' && (data.mute as boolean) !== muted) toggleSound();
}
export function savePrefs(): void {
  try { storage.set(KEY, JSON.stringify({ speed: ui.speed, skin: kit.skin, edgePan: settings.edgePan, hints: settings.hints, thoughts: settings.thoughts, fx: settings.fx, ambience: settings.ambienceVolume, sfx: settings.sfxVolume, mute: muted, guide: ui.guide, missions: won, windows: winExport() })); }
  catch (error) { console.warn('The options could not be saved: ' + error.message); }
}
