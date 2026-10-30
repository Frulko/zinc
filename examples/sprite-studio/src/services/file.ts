// Saving and loading the sprite: one JSON file in the app's folder (the program runs in its project), or SPRITE_STUDIO_FILE.
import * as fs from 'zinc:fs';
import { env } from 'zinc:sys';
import { SAVE_FILE } from '../constants';
import { Sprite, spriteToJson, spriteFromJson } from '../sprite';

export function savePath(): string { const p = env('SPRITE_STUDIO_FILE'); return p !== '' ? p : SAVE_FILE; }

/** Writes the sprite; '' when it worked, else why not. */
export function saveSprite(s: Sprite): string {
  try { fs.writeText(savePath(), spriteToJson(s)); return ''; } catch (e) { return `${e}`; }
}

/** The saved sprite, or the reason there is none. */
export class Loaded { sprite: Sprite | null = null; error = ''; }
export function loadSprite(): Loaded {
  const out = new Loaded();
  const path = savePath();
  if (!fs.exists(path)) { out.error = `No ${path} yet: save first`; return out; }
  try {
    out.sprite = spriteFromJson(fs.readText(path));
    if (out.sprite === null) out.error = `${path} is not a sprite of this studio`;
  } catch (e) { out.error = `${e}`; }
  return out;
}
