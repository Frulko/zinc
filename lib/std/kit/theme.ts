// zinc:ui/kit — theme tokens.
//
// A theme names the colour of every role a component can play (shadcn/ui's CSS variables, expressed as Tailwind
// colour names such as 'zinc-900'). Components build their classes from the current theme, so:
//   - Solid model: `setTheme(DARK)` restyles every mounted kit component (the theme is a signal);
//   - React model: the new theme applies on the next render.
// App code can use the same tokens for its own nodes: `<View className={`bg-${theme().muted}`}>`.
import { createSignal } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { lookName, setPlatformLook, setAccent } from '../platform/index';

export interface Theme {
  name: string;
  background: string;            // the page
  foreground: string;            // main text
  card: string;                  // cards, lists, tab triggers
  muted: string;                 // quiet fills: tracks, secondary surfaces
  mutedForeground: string;       // secondary text
  border: string;                // hairlines and outlines
  input: string;                 // unchecked switch track
  primary: string;               // default button, checked switch, progress
  primaryForeground: string;
  primaryFocus: string;          // focused / pressed shades of primary
  primaryPressed: string;
  secondary: string;
  secondaryForeground: string;
  secondaryPressed: string;
  subtle: string;                // ghost / outline focus and press fill
  accent: string;                // the one brand colour
  accentForeground: string;
  accentSoft: string;            // tinted backgrounds (badges, highlights)
  accentSoftForeground: string;
  destructive: string;
  destructiveForeground: string;
  destructivePressed: string;
  destructiveSoft: string;
  destructiveSoftForeground: string;
  success: string;
  successSoft: string;
  successSoftForeground: string;
  warningSoft: string;
  warningSoftForeground: string;
}

/** Light neutral theme (the default): white surfaces, zinc greys, one indigo accent. */
export const LIGHT: Theme = {
  name: 'light',
  background: 'zinc-50', foreground: 'zinc-950', card: 'white', muted: 'zinc-100', mutedForeground: 'zinc-500',
  border: 'zinc-200', input: 'zinc-200',
  primary: 'zinc-900', primaryForeground: 'zinc-50', primaryFocus: 'zinc-800', primaryPressed: 'zinc-700',
  secondary: 'zinc-100', secondaryForeground: 'zinc-900', secondaryPressed: 'zinc-200', subtle: 'zinc-100',
  accent: 'indigo-600', accentForeground: 'white', accentSoft: 'indigo-50', accentSoftForeground: 'indigo-700',
  destructive: 'red-600', destructiveForeground: 'white', destructivePressed: 'red-700',
  destructiveSoft: 'red-50', destructiveSoftForeground: 'red-700',
  success: 'emerald-600', successSoft: 'emerald-50', successSoftForeground: 'emerald-700',
  warningSoft: 'amber-50', warningSoftForeground: 'amber-700',
};

/** Dark variant of the same roles. */
export const DARK: Theme = {
  name: 'dark',
  background: 'zinc-950', foreground: 'zinc-50', card: 'zinc-900', muted: 'zinc-800', mutedForeground: 'zinc-400',
  border: 'zinc-800', input: 'zinc-700',
  primary: 'zinc-50', primaryForeground: 'zinc-900', primaryFocus: 'zinc-200', primaryPressed: 'zinc-300',
  secondary: 'zinc-800', secondaryForeground: 'zinc-50', secondaryPressed: 'zinc-700', subtle: 'zinc-800',
  accent: 'indigo-500', accentForeground: 'white', accentSoft: 'indigo-950', accentSoftForeground: 'indigo-300',
  destructive: 'red-600', destructiveForeground: 'white', destructivePressed: 'red-700',
  destructiveSoft: 'red-950', destructiveSoftForeground: 'red-300',
  success: 'emerald-500', successSoft: 'emerald-950', successSoftForeground: 'emerald-300',
  warningSoft: 'amber-950', warningSoftForeground: 'amber-300',
};

// ---- colour schemes (ZN-271): the kit's classes use `[var(--role)]` colours that follow ui.setScheme, so switching to DARK restyles
// only the flagged nodes: no signal changes, no component re-renders. A custom Theme (any other object) still goes through the signal.
const KEYS: string[] = ['background', 'foreground', 'card', 'muted', 'mutedForeground', 'border', 'input', 'primary', 'primaryForeground', 'primaryFocus', 'primaryPressed', 'secondary', 'secondaryForeground', 'secondaryPressed', 'subtle', 'accent', 'accentForeground', 'accentSoft', 'accentSoftForeground', 'destructive', 'destructiveForeground', 'destructivePressed', 'destructiveSoft', 'destructiveSoftForeground', 'success', 'successSoft', 'successSoftForeground', 'warningSoft', 'warningSoftForeground'];
function valuesOf(t: Theme): string[] { return [t.background, t.foreground, t.card, t.muted, t.mutedForeground, t.border, t.input, t.primary, t.primaryForeground, t.primaryFocus, t.primaryPressed, t.secondary, t.secondaryForeground, t.secondaryPressed, t.subtle, t.accent, t.accentForeground, t.accentSoft, t.accentSoftForeground, t.destructive, t.destructiveForeground, t.destructivePressed, t.destructiveSoft, t.destructiveSoftForeground, t.success, t.successSoft, t.successSoftForeground, t.warningSoft, t.warningSoftForeground]; }
function colorsOf(t: Theme): i32[] { return valuesOf(t).map((n: string): i32 => ui.tailwindColor(n)); }
/** LIGHT and DARK as variable references: what theme() returns for the two built-in themes. */
const VARS: Theme = { name: 'vars', background: '[var(--background)]', foreground: '[var(--foreground)]', card: '[var(--card)]', muted: '[var(--muted)]', mutedForeground: '[var(--mutedForeground)]', border: '[var(--border)]', input: '[var(--input)]', primary: '[var(--primary)]', primaryForeground: '[var(--primaryForeground)]', primaryFocus: '[var(--primaryFocus)]', primaryPressed: '[var(--primaryPressed)]', secondary: '[var(--secondary)]', secondaryForeground: '[var(--secondaryForeground)]', secondaryPressed: '[var(--secondaryPressed)]', subtle: '[var(--subtle)]', accent: '[var(--accent)]', accentForeground: '[var(--accentForeground)]', accentSoft: '[var(--accentSoft)]', accentSoftForeground: '[var(--accentSoftForeground)]', destructive: '[var(--destructive)]', destructiveForeground: '[var(--destructiveForeground)]', destructivePressed: '[var(--destructivePressed)]', destructiveSoft: '[var(--destructiveSoft)]', destructiveSoftForeground: '[var(--destructiveSoftForeground)]', success: '[var(--success)]', successSoft: '[var(--successSoft)]', successSoftForeground: '[var(--successSoftForeground)]', warningSoft: '[var(--warningSoft)]', warningSoftForeground: '[var(--warningSoftForeground)]' };

// ---- the Quiet theme (docs/design.md, ZN-1078.02): CUI's colours (github.com/yappologistic/CUI, MIT, src/cui_theme.c; its OKLab greys as sRGB)
// in the kit's roles, light and dark, with the Quiet look of zinc:ui/platform for the shapes. Turned on by useQuietTheme() (or the look
// 'quiet': ZINC_PLATFORM_LOOK=quiet, <ThemeProvider look="quiet">): the 'light' and 'dark' schemes then carry these values.

/** [light, dark] for each role, in KEYS' order, with the neutral accent. */
const QUIET_ROLES: i32[] = [
  0xf2f2f2, 0x121212,   // background: the page (OKLab L 0.962 / 0.18)
  0x0b0b0b, 0xf2f2f2,   // foreground (0.15 / 0.96)
  0xffffff, 0x181818,   // card: surfaces one level up (1 / 0.21)
  0xf1f1f1, 0x252525,   // muted: tracks, quiet fills
  0x585858, 0xb4b4b4,   // mutedForeground: secondary text (0.46 / 0.77)
  0xe3e3e3, 0x2b2b2b,   // border: the hairline (0.915 / 0.29)
  0x949494, 0x676767,   // input: a field's 3:1 edge (0.665 / 0.515)
  0x1d1d1d, 0xe8e8e8,   // primary: the solid button (control on, 0.23 / 0.93)
  0xffffff, 0x141414,   // primaryForeground
  0x353535, 0xd1d1d1,   // primaryFocus
  0x353535, 0xd1d1d1,   // primaryPressed
  0xebebeb, 0x2e2e2e,   // secondary: the soft button
  0x0b0b0b, 0xf2f2f2,   // secondaryForeground
  0xdcdcdc, 0x404040,   // secondaryPressed
  0xf3f3f3, 0x222222,   // subtle: hover and press (the text at 5 %)
  0x353535, 0xbebebe,   // accent (neutral: 0.33 / 0.80)
  0xf2f2f2, 0x121212,   // accentForeground
  0xebebeb, 0x2e2e2e,   // accentSoft: the selection
  0x1f1f1f, 0xe1e1e1,   // accentSoftForeground (accent strong)
  0xc9302d, 0xf2716c,   // destructive (oklch 0.55 0.19 27 / 0.70 0.16 24)
  0xffffff, 0x141414,   // destructiveForeground
  0xa82724, 0xf59a96,   // destructivePressed
  0xfaeaea, 0x3b2625,   // destructiveSoft
  0xc9302d, 0xf2716c,   // destructiveSoftForeground
  0x00774d, 0x55d69f,   // success (green tone)
  0xe6f1ed, 0x22362e,   // successSoft
  0x00774d, 0x55d69f,   // successSoftForeground
  0xf5efe6, 0x3b3225,   // warningSoft
  0x9f6202, 0xf2bd68,   // warningSoftForeground (amber tone)
];

/** The accents of the Quiet theme, CUI's eight, tuned per scheme so text and controls keep their contrast. */
export const ACCENTS: string[] = ['neutral', 'violet', 'blue', 'green', 'amber', 'orange', 'coral', 'rose'];
/** Per accent after neutral: accent, strong, soft alpha, text on it (light); the same (dark); the control colour and its glyph, light then dark. */
const ACCENT_TABLE: i32[] = [
  0x7747ff, 0x5528ce, 0x21, 0xffffff, 0xa78bff, 0xc7b7ff, 0x38, 0x15102b, 0x7747ff, 0xffffff, 0x8a66ff, 0xffffff,   // violet
  0x0562ef, 0x074db7, 0x1f, 0xffffff, 0x6ba3ff, 0xa4c7ff, 0x38, 0x0b1526, 0x0562ef, 0xffffff, 0x3b82f6, 0xffffff,   // blue
  0x00864b, 0x006c36, 0x21, 0xffffff, 0x53dca6, 0x93efd0, 0x33, 0x102016, 0x00864b, 0xffffff, 0x1fae78, 0xffffff,   // green
  0xf3ad20, 0x9c6300, 0x29, 0x20190d, 0xffcb62, 0xffe0a1, 0x33, 0x20190d, 0xeda11a, 0x2a1c03, 0xe8a52a, 0x241803,   // amber
  0xc25300, 0xa43d00, 0x21, 0xffffff, 0xffad5e, 0xffd0a0, 0x33, 0x17130f, 0xc25300, 0xffffff, 0xef873a, 0xffffff,   // orange
  0xd1403a, 0xb12926, 0x24, 0xffffff, 0xff9386, 0xffc1ba, 0x33, 0x21110f, 0xd1403a, 0xffffff, 0xec6a60, 0xffffff,   // coral
  0xd23286, 0xb2186e, 0x24, 0xffffff, 0xff8bc5, 0xffc0df, 0x33, 0x250f1b, 0xd23286, 0xffffff, 0xe457a0, 0xffffff,   // rose
];
let accentName = 'neutral';

/** c over bg at alpha a (0..255): an accent's tint on a surface (the schemes hold opaque colours). */
function over(c: i32, bg: i32, a: i32): i32 {
  const mix = (s: i32): i32 => Math.round((((c >> s) & 255) * a + ((bg >> s) & 255) * (255 - a)) / 255) as i32;
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}
/** A colour made darker (k < 0) or lighter (k > 0) by |k|: the focused and pressed shades of an accent. */
function shade(c: i32, k: number): i32 {
  const f = (s: i32): i32 => { const v = (c >> s) & 255; return Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k) as i32; };
  return (f(16) << 16) | (f(8) << 8) | f(0);
}

/** The Quiet colours of one scheme (0 light, 1 dark) with the current accent, in KEYS' order. */
function quietColors(k: i32): i32[] {
  const out: i32[] = [];
  for (let i = 0; i < KEYS.length; i++) out.push(QUIET_ROLES[i * 2 + k]);
  const a = ACCENTS.indexOf(accentName) - 1;
  if (a < 0) return out;
  const row = a * 12, d = k * 4;
  const set = (key: string, v: i32): void => { out[KEYS.indexOf(key)] = v; };
  set('accent', ACCENT_TABLE[row + d]);
  set('accentSoftForeground', ACCENT_TABLE[row + d + 1]);
  set('accentSoft', over(ACCENT_TABLE[row], QUIET_ROLES[KEYS.indexOf('card') * 2 + k], ACCENT_TABLE[row + d + 2]));
  set('accentForeground', ACCENT_TABLE[row + d + 3]);
  const on = ACCENT_TABLE[row + 8 + k * 2], glyph = ACCENT_TABLE[row + 9 + k * 2];
  set('primary', on); set('primaryForeground', glyph);
  set('primaryFocus', shade(on, k === 0 ? -0.12 : 0.15)); set('primaryPressed', shade(on, k === 0 ? -0.2 : 0.25));
  return out;
}

// The schemes are defined when a theme is first read, not at import: a program that never draws a kit component pays nothing (ZN-1078.03),
// and the values follow the look (the kit's own colours, or the Quiet ones under the look 'quiet').
let defined = '';   // the colours the 'light' and 'dark' schemes carry: '' none yet, 'kit', or 'quiet:<accent>'
function defineSchemes(): void {
  const want = lookName() === 'quiet' ? 'quiet:' + accentName : 'kit';
  if (want === defined) return;
  defined = want;
  ui.defineScheme('light', KEYS, want === 'kit' ? colorsOf(LIGHT) : quietColors(0));
  ui.defineScheme('dark', KEYS, want === 'kit' ? colorsOf(DARK) : quietColors(1));
}

const [current, setCurrent] = createSignal<Theme>(VARS);

/** The current theme (a tracked read under Solid). */
export function theme(): Theme { defineSchemes(); return current(); }

/** Switches every kit component to another theme: LIGHT and DARK switch the colour scheme only, any other theme goes through the signal. */
export function setTheme(t: Theme): void {
  defineSchemes();
  if (t === LIGHT || t === DARK) { ui.setScheme(t.name); setCurrent(VARS); }
  else setCurrent(t);
}

/** The Quiet theme (docs/design.md): CUI's look and colours for every kit component, light and dark (setTheme(DARK), ui.setScheme('auto')),
 *  with one accent of ACCENTS. Call it before the first render. */
export function useQuietTheme(accent: string = 'neutral'): void {
  setPlatformLook('quiet');
  setThemeAccent(accent);
}

/** The Quiet theme's accent ('neutral', 'violet', 'blue', 'green', 'amber', 'orange', 'coral', 'rose'): mounted components follow it at once. */
export function setThemeAccent(name: string): void {
  accentName = ACCENTS.indexOf(name) >= 0 ? name : 'neutral';
  const a = ACCENTS.indexOf(accentName) - 1, row = a * 12;
  if (a < 0) setAccent(-1); else setAccent(ACCENT_TABLE[row + 8], ACCENT_TABLE[row + 10], ACCENT_TABLE[row + 9]);
  defineSchemes();
}

/** The Quiet theme's accent now. */
export function themeAccent(): string { return accentName; }

/** A role's colour ('foreground', 'mutedForeground', 'accent'...) as 0xRRGGBB in the scheme shown, for what draws with a colour value (icons,
 *  canvases); -1 for an unknown role. Read it where the drawing happens, so it follows the scheme and the accent. */
export function themeColor(role: string): i32 {
  defineSchemes();
  const i = KEYS.indexOf(role), dark = ui.currentScheme() === 'dark';
  if (i < 0) return -1;
  if (current() !== VARS) return ui.tailwindColor(valuesOf(current())[i]);
  if (defined === 'kit') return ui.tailwindColor(valuesOf(dark ? DARK : LIGHT)[i]);
  return quietColors(dark ? 1 : 0)[i];   // ponytail: rebuilds the 29 colours per call; cache them per scheme if a canvas reads many per frame
}
