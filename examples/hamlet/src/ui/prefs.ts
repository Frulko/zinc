import * as storage from 'zinc:storage';
import { settings } from '../settings';
import { ui, SPEEDS } from './state';
import { kit, setSkin } from './kit';
import { muted, toggleSound } from '../audio';

// The player's options, kept between runs in their own storage key (the village has its own save). Developer-panel values are not saved.
const KEY = 'hamlet:prefs';
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
  if (typeof data.ambience === 'number') settings.ambienceVolume = Math.max(0, Math.min(1, data.ambience as number));
  if (typeof data.sfx === 'number') settings.sfxVolume = Math.max(0, Math.min(1, data.sfx as number));
  if (typeof data.mute === 'boolean' && (data.mute as boolean) !== muted) toggleSound();
}
export function savePrefs(): void {
  try { storage.set(KEY, JSON.stringify({ speed: ui.speed, skin: kit.skin, edgePan: settings.edgePan, hints: settings.hints, ambience: settings.ambienceVolume, sfx: settings.sfxVolume, mute: muted })); }
  catch (error) { console.warn('The options could not be saved: ' + error.message); }
}
