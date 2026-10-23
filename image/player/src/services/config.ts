// ============================================================================
// services/config.ts — The player's preferences, loaded and saved as JSON
// ============================================================================
// <ZINC_HOME>/player.json (ZINC_PLAYER_CONFIG overrides). Saving keeps the keys this version does not know.

import * as fs from 'zinc:fs';
import { BACKGROUND_THEMES, KEYBOARD_AZERTY, KEYBOARD_QWERTY } from '../constants';

export class PlayerConfig {
  /** An index of BACKGROUND_THEMES. */
  backgroundTheme: i32 = 0;
  /** KEYBOARD_QWERTY or KEYBOARD_AZERTY: the letters of the on-screen keyboard. */
  keyboardLayout: string = KEYBOARD_QWERTY;
  /** The slow animation behind the home page (off on a machine where it costs too much). */
  animation: boolean = true;
}

function readOrEmpty(path: string): string {
  try {
    return fs.readText(path);
  } catch (e) {
    return '';
  }
}

export function loadConfig(path: string): PlayerConfig {
  const config = new PlayerConfig();
  const text = readOrEmpty(path);
  if (text.trim() === '') return config;
  try {
    const o: any = JSON.parse(text);
    if (typeof o.backgroundTheme === 'number') {
      const theme = o.backgroundTheme as i32;
      if (theme >= 0 && theme < BACKGROUND_THEMES.length) config.backgroundTheme = theme;
    }
    if (o.keyboardLayout === KEYBOARD_AZERTY) config.keyboardLayout = KEYBOARD_AZERTY;
    if (typeof o.animation === 'boolean') config.animation = o.animation as boolean;
  } catch (e) {
    // a damaged file: the defaults, and the next save writes a good one
  }
  return config;
}

export function saveConfig(path: string, config: PlayerConfig): void {
  const previous = readOrEmpty(path);
  let o: any = JSON.parse('{}');
  try {
    if (previous.trim() !== '') o = JSON.parse(previous);
  } catch (e) {
    o = JSON.parse('{}');
  }
  o.backgroundTheme = config.backgroundTheme;
  o.keyboardLayout = config.keyboardLayout;
  o.animation = config.animation;
  try {
    fs.mkdir(path.slice(0, path.lastIndexOf('/')), true);
    fs.writeText(path, JSON.stringify(o) + '\n');
  } catch (e) {
    // a read-only home: the choice lasts until the player ends
  }
}
