// The e-ink skin (ZN-934): on a panel (or with ZINC_EINK=1) the app draws in black and white, a pattern per room, line-art decor and no sprite, tint,
// veil or shadow. zinc:ui snaps what the classes ask for; this file holds what the canvas and the tokens need. The Mac app (INK false) is unchanged.
import { EINK, setFontScale } from 'zinc:ui';
export const INK: boolean = EINK;
if (INK) setFontScale(1.25);   // the panel's 229 ppi come as a 1080x810 surface at 2 physical pixels each (zinc.json): the desktop's sizes, a little larger for the hand's reach
/** Extra classes for the e-ink skin only (the later token wins). */
export function ink(classes: string): string { return INK ? ' ' + classes : ''; }
