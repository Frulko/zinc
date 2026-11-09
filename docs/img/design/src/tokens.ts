// The Quiet theme's roles the pictures draw with (zinc:ui/kit, docs/design.md); the "don't" halves pick their colours by hand on purpose.
import { theme } from 'zinc:ui/kit';

const t = theme();
export const PAGE = t.background;
export const SURFACE = t.card;
export const FOREGROUND = t.foreground;
export const SECONDARY = t.mutedForeground;
export const HAIRLINE = t.border;
export const EDGE = t.input;              // the 3:1 edge of a field
export const CONTROL = t.primary;         // the solid button, the switch that is on
export const ACCENT_SOFT = t.accentSoft;  // the selected row
export const SUCCESS = t.success;
export const DANGER = t.destructive;
export const FOCUS = '[#1f7dcf]';         // the keyboard focus ring (CUI's, with the neutral accent)
/** The floating shadow of the Quiet look: a short drop pulled in at the sides and a tight contact shadow. */
export const FLOATING_SHADOW = 'shadow-[0_12px_32px_-4px_rgba(0,0,0,0.12),0_1px_3px_rgba(0,0,0,0.06)]';
