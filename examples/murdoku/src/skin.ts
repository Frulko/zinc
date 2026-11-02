// The e-ink skin (ZN-934): on a panel (or with ZINC_EINK=1) the app draws in black and white, a pattern per room, line-art decor and no sprite, tint,
// veil or shadow. zinc:ui snaps what the classes ask for; this file holds what the canvas and the tokens need. The Mac app (INK false) is unchanged.
import { EINK, setFontScale, setEinkColour } from 'zinc:ui';
import { createSignal } from 'zinc:ui/solid';
import * as storage from 'zinc:storage';
import { env } from 'zinc:sys';
export const INK: boolean = EINK;   // the e-ink LAYOUT (no scroll, big targets, pen); the colours are `bw()`
/** A colour panel (the Paper Pro's driver sets ZINC_EINK_COLOUR): the player may switch the plan to colour. */
export const COLOUR_PANEL: boolean = INK && env('ZINC_EINK_COLOUR') === '1';
const saved = COLOUR_PANEL ? storage.get('colour') : '';   // the player's last choice; a colour panel starts in colour
export const [colour, setColourSignal] = createSignal(COLOUR_PANEL && saved !== '0');
setEinkColour(colour());
/** Colour or black and white, remembered across launches. */
export function setColour(on: boolean): void { setColourSignal(on); setEinkColour(on); storage.set('colour', on ? '1' : '0'); }
/** True when the e-ink skin draws in black and white (reactive). */
export function bw(): boolean { return INK && !colour(); }
if (INK) setFontScale(1.25);   // the panel's 229 ppi come as a 1080x810 surface at 2 physical pixels each (zinc.json): the desktop's sizes, a little larger for the hand's reach
/** Extra classes for the e-ink skin only (the later token wins). */
export function ink(classes: string): string { return INK ? ' ' + classes : ''; }
