// The e-ink skin (ZN-934): on a panel (or with ZINC_EINK=1) the app draws in black and white, a pattern per room, line-art decor and no sprite, tint,
// veil or shadow. zinc:ui snaps what the classes ask for; this file holds what the canvas and the tokens need. The Mac app (INK false) is unchanged.
import { EINK, setFontScale } from 'zinc:ui';
export const INK: boolean = EINK;
if (INK) setFontScale(1.5);   // 229 ppi: the 10 to 14 px captions of the desktop become 15 to 21
/** Extra classes for the e-ink skin only (the later token wins). */
export function ink(classes: string): string { return INK ? ' ' + classes : ''; }
