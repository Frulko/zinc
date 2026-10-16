// The design tokens: warm neutrals, a coral accent, status colours, a 4 px spacing grid, radii and a type scale, in a light and a dark scheme.
// The App component reads the scheme (useColorScheme) and re-renders the whole tree when it changes, so screens read the palette with
// `theme()` instead of subscribing themselves.
import { Appearance } from 'zinc:react-native';

export class Palette {
  bg: number = 0; surface: number = 0; raised: number = 0; ink: number = 0; muted: number = 0; faint: number = 0; line: number = 0;
  accent: number = 0; accentInk: number = 0; accentSoft: number = 0;
  ok: number = 0; okSoft: number = 0; warn: number = 0; warnSoft: number = 0; danger: number = 0; dangerSoft: number = 0; info: number = 0; infoSoft: number = 0;
  violet: number = 0; teal: number = 0;
}
function palette(v: number[]): Palette {
  const p = new Palette();
  p.bg = v[0]; p.surface = v[1]; p.raised = v[2]; p.ink = v[3]; p.muted = v[4]; p.faint = v[5]; p.line = v[6];
  p.accent = v[7]; p.accentInk = v[8]; p.accentSoft = v[9];
  p.ok = v[10]; p.okSoft = v[11]; p.warn = v[12]; p.warnSoft = v[13]; p.danger = v[14]; p.dangerSoft = v[15]; p.info = v[16]; p.infoSoft = v[17];
  p.violet = v[18]; p.teal = v[19];
  return p;
}
export const LIGHT = palette([0xF6F3EE, 0xFFFFFF, 0xEFEAE3, 0x1C1917, 0x6B635C, 0xA8A29E, 0xE7E1D8, 0xE8492A, 0xFFFFFF, 0xFFE4DC,
  0x15803D, 0xDCFCE7, 0xB45309, 0xFEF3C7, 0xDC2626, 0xFEE2E2, 0x2563EB, 0xDBEAFE, 0x6D28D9, 0x0F766E]);
export const DARK = palette([0x0E0D0C, 0x191715, 0x24211E, 0xF5F2EE, 0xA8A29E, 0x78716C, 0x2E2A26, 0xFF7A59, 0x1C0F0A, 0x3A1F17,
  0x4ADE80, 0x14301F, 0xFBBF24, 0x3A2A0C, 0xF87171, 0x3B1414, 0x60A5FA, 0x13233F, 0xA78BFA, 0x2DD4BF]);

/** The palette of the current scheme (Appearance is the one source of truth). */
export function theme(): Palette { return Appearance.getColorScheme() === 'dark' ? DARK : LIGHT; }

// spacing on a 4 px grid, radii, the type scale
export const SP = 4;
export const R_CARD = 20, R_CONTROL = 12, R_PILL = 999;
export const T_DISPLAY = 32, T_TITLE = 22, T_HEADING = 17, T_BODY = 15, T_SMALL = 13, T_TINY = 11;
