// The design tokens of the showcase: its own visual language (warm neutrals, a coral accent, tight large titles, generous radii), in a light and a dark scheme.
// Every screen reads colours from `t()`; sizes, radii and the type scale are constants.
import { createSignal } from 'zinc:ui/solid';

export class Palette {
  bg: i32; surface: i32; raised: i32; ink: i32; muted: i32; faint: i32; line: i32; accent: i32; accentInk: i32; accentSoft: i32; teal: i32; amber: i32; violet: i32;
  constructor(bg: i32, surface: i32, raised: i32, ink: i32, muted: i32, faint: i32, line: i32, accent: i32, accentInk: i32, accentSoft: i32, teal: i32, amber: i32, violet: i32) {
    this.bg = bg; this.surface = surface; this.raised = raised; this.ink = ink; this.muted = muted; this.faint = faint; this.line = line;
    this.accent = accent; this.accentInk = accentInk; this.accentSoft = accentSoft; this.teal = teal; this.amber = amber; this.violet = violet;
  }
}

export const LIGHT = new Palette(0xF6F3EE, 0xFFFFFF, 0xEFEAE3, 0x1C1917, 0x6B635C, 0xA8A29E, 0xE7E1D8, 0xFF5A36, 0xFFFFFF, 0xFFE4DC, 0x0F766E, 0xD97706, 0x6D28D9);
export const DARK = new Palette(0x0E0D0C, 0x191715, 0x24211E, 0xF5F2EE, 0xA8A29E, 0x6B635C, 0x2E2A26, 0xFF7A59, 0x1C0F0A, 0x3A1F17, 0x2DD4BF, 0xFBBF24, 0xA78BFA);

const [dark, setDarkSignal] = createSignal<boolean>(false);
export function isDark(): boolean { return dark(); }
export function setDark(on: boolean): void { setDarkSignal(on); }
export function t(): Palette { return dark() ? DARK : LIGHT; }

// spacing on a 4 px grid, radii and the type scale
export const S1 = 4, S2 = 8, S3 = 12, S4 = 16, S5 = 20, S6 = 24, S8 = 32;
export const R_CARD = 22, R_CONTROL = 14, R_PILL = 999;
export const T_DISPLAY = 34, T_TITLE = 22, T_BODY = 16, T_SMALL = 14, T_TINY = 12;
