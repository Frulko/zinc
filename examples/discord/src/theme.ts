// Themes: plain JSON files (assets/themes/theme.schema.json and the README say what a file holds), the ones shipped in assets/themes and
// the user's own in <data dir>/themes (a file of the same name replaces a shipped one). A theme's colours become scheme variables
// (`bg-[var(--dc-main)]`, constants.ts) of its base scheme: choosing one recolours the screen without a render. Its radius, font, text size
// and density are read by the components at render. The choice stays on this machine (zinc:storage).
import * as ui from 'zinc:ui';
import * as assets from 'zinc:assets';
import { readText, list, exists, mkdir } from 'zinc:fs';
import { dataDir } from 'zinc:system/window';
import * as storage from 'zinc:storage';
import { env } from 'zinc:sys';

/** The colour tokens of a theme file, in the order of their scheme variables (dc- and the name in kebab case: rowHover -> --dc-row-hover). */
export const TOKENS: string[] = ['rail', 'sidebar', 'main', 'footer', 'input', 'hover', 'rowHover', 'selected', 'divider', 'border', 'faint',
  'text', 'muted', 'strong', 'icon', 'error', 'link', 'mention', 'spoiler', 'accent', 'accentPressed', 'accentSoft',
  'accentSoftText', 'danger', 'badge', 'accentText', 'success', 'warning', 'stage', 'stageTile',
  'sidebarText', 'sidebarMuted', 'sidebarStrong', 'sidebarHover', 'sidebarSelected', 'sidebarSelectedText', 'surface'];
/** The tokens of the channel list and the server rail that follow another token until a theme sets them (a dark sidebar on a light theme sets them). */
const FOLLOW: string[][] = [['sidebarText', 'text'], ['sidebarMuted', 'muted'], ['sidebarStrong', 'strong'], ['sidebarHover', 'hover'], ['sidebarSelected', 'selected'], ['sidebarSelectedText', 'strong'], ['surface', 'sidebar']];
// Discord's dark theme: every colour a theme leaves out comes from here (or from DISCORD_LIGHT for a light theme)
const DISCORD_DARK: i32[] = [0x1e1f22, 0x2b2d31, 0x313338, 0x232428, 0x383a40, 0x35373c, 0x2e3035, 0x404249, 0x1f2023, 0x1e1f22, 0x4e5058,
  0xdbdee1, 0x949ba4, 0xf2f3f5, 0xb5bac1, 0xfa777c, 0x00a8fc, 0xc9cdfb, 0x6d6f78, 0x5865f2, 0x4752c4, 0x3b405a,
  0xdee0fc, 0xda373c, 0xf23f43, 0xffffff, 0x23a55a, 0xf0b232, 0x111214, 0x2b2d31,
  0xdbdee1, 0x949ba4, 0xf2f3f5, 0x35373c, 0x404249, 0xf2f3f5, 0x2b2d31];
const DISCORD_LIGHT: i32[] = [0xe3e5e8, 0xf2f3f5, 0xffffff, 0xebedef, 0xebedef, 0xe8e9ec, 0xf7f7f8, 0xd4d7dc, 0xe1e2e4, 0xe3e5e8, 0xc4c9ce,
  0x313338, 0x5c5e66, 0x060607, 0x4e5058, 0xda373c, 0x006ce7, 0x505cdc, 0xc4c9ce, 0x5865f2, 0x4752c4, 0xe6e8fd,
  0x3c45a5, 0xda373c, 0xf23f43, 0xffffff, 0x23a55a, 0xf0b232, 0x111214, 0x2b2d31,
  0x313338, 0x5c5e66, 0x060607, 0xe8e9ec, 0xd4d7dc, 0x060607, 0xf2f3f5];
const varName = (t: string): string => `dc-${t.replace(/[A-Z]/g, (c: string): string => `-${c.toLowerCase()}`)}`;
// zinc:ui/kit's variables (its Switch, CallStats, the screen-share picker...) from a theme's tokens, so the kit's parts wear the theme too;
// the kit's soft tints keep their own
const KIT: string[][] = [['background', 'main'], ['foreground', 'text'], ['card', 'main'], ['muted', 'input'], ['mutedForeground', 'muted'],
  ['border', 'border'], ['input', 'faint'], ['primary', 'accent'], ['primaryForeground', 'accentText'], ['primaryFocus', 'accentPressed'],
  ['primaryPressed', 'accentPressed'], ['secondary', 'input'], ['secondaryForeground', 'text'], ['secondaryPressed', 'hover'], ['subtle', 'hover'],
  ['accent', 'accent'], ['accentForeground', 'accentText'], ['accentSoft', 'accentSoft'], ['accentSoftForeground', 'accentSoftText'],
  ['destructive', 'danger'], ['destructiveForeground', 'accentText'], ['destructivePressed', 'danger'], ['success', 'success']];
function defineColors(scheme: string, colors: i32[]): void {
  ui.defineScheme(scheme, TOKENS.map(varName), colors);
  ui.defineScheme(scheme, KIT.map((k: string[]): string => k[0]), KIT.map((k: string[]): i32 => colors[TOKENS.indexOf(k[1])]));
}
// the variables exist from the start (Discord's colours), so runColor() names them before a theme is read
defineColors('light', DISCORD_LIGHT);
defineColors('dark', DISCORD_DARK);
/** The class colour of a token: `bg-${v('main')}` is `bg-[var(--dc-main)]`. */
export const v = (token: string): string => `[var(--${varName(token)})]`;

export class Theme {
  id = ''; name = ''; scheme = 'dark';
  colors: i32[] = DISCORD_DARK.slice();
  /** px of the rounded corners of the composer, code blocks and cards. */
  radius: i32 = 8;
  /** A font family the app ships (assets/<Family>.ttf), '' for the default. */
  font = '';
  textSize: i32 = 15;
  /** 'cozy' (Discord's) or 'compact' (closer rows). */
  density = 'cozy';
  /** The message box has an outline (Slack's). */
  composerBorder = false;
  /** shipped, or the user's own folder */
  own = false;
}

/** #rrggbb as 0xrrggbb; -1 when it is not one. */
function hex(s: any): i32 { return typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s) ? parseInt(s.slice(1), 16) : -1; }

/** A theme from its JSON text; the error names the file and the field. */
export function parseTheme(id: string, text: string): Theme {
  const j: any = JSON.parse(text);
  const t = new Theme();
  t.id = id;
  t.name = typeof j.name === 'string' && j.name !== '' ? j.name : id;
  if (j.scheme !== undefined && j.scheme !== 'dark' && j.scheme !== 'light') throw new Error(`${id}: "scheme" is "dark" or "light"`);
  t.scheme = j.scheme === 'light' ? 'light' : 'dark';
  t.colors = (t.scheme === 'light' ? DISCORD_LIGHT : DISCORD_DARK).slice();
  const c: any = j.colors, set: string[] = [];
  if (c !== undefined && c !== null) for (const k of Object.keys(c)) {
    const i = TOKENS.indexOf(k), col = hex(c[k]);
    if (i < 0) throw new Error(`${id}: unknown colour "${k}"`);
    if (col < 0) throw new Error(`${id}: colour "${k}" is not #rrggbb`);
    t.colors[i] = col;
    set.push(k);
  }
  for (const f of FOLLOW) if (set.indexOf(f[0]) < 0) t.colors[TOKENS.indexOf(f[0])] = t.colors[TOKENS.indexOf(f[1])];
  if (typeof j.radius === 'number') t.radius = Math.max(0, Math.min(24, Math.round(j.radius)));
  if (typeof j.font === 'string') t.font = j.font;
  if (typeof j.textSize === 'number') t.textSize = Math.max(11, Math.min(22, Math.round(j.textSize)));
  if (j.density !== undefined && j.density !== 'cozy' && j.density !== 'compact') throw new Error(`${id}: "density" is "cozy" or "compact"`);
  if (j.density === 'compact') t.density = 'compact';
  if (j.composerBorder === true) t.composerBorder = true;
  return t;
}

const KEY = 'theme';
const fallback = (): Theme => { const t = new Theme(); t.id = 'discord-dark'; t.name = 'Discord dark'; return t; };
let theme: Theme = fallback();
let themes: Theme[] = [];
let errors: string[] = [];
/** The theme in use. */
export function currentTheme(): Theme { return theme; }
/** The themes found, shipped first. */
export function allThemes(): Theme[] { return themes; }
/** What was wrong with the files that could not be read. */
export function themeErrors(): string[] { return errors; }

/** The user's folder of themes (made when missing, so it can be opened). */
export function userThemesDir(): string { const d = `${dataDir()}/themes`; if (!exists(d)) mkdir(d, true); return d; }

/** Reads the shipped themes and the user's folder. */
export function loadThemes(): void {
  const found = new Map<string, Theme>();
  errors = [];
  const add = (file: string, text: () => string, own: boolean): void => {
    if (!file.endsWith('.json') || file.endsWith('.schema.json')) return;
    const id = file.slice(file.lastIndexOf('/') + 1, file.length - 5);
    try { const t = parseTheme(id, text()); t.own = own; found.set(id, t); }
    catch (e) { errors.push(`${file.slice(file.lastIndexOf('/') + 1)}: ${e.message}`); }
  };
  for (const name of assets.list()) if (name.startsWith('themes/')) add(name, (): string => assets.readText(name), false);
  try { const dir = userThemesDir(); for (const f of list(dir)) add(f, (): string => readText(`${dir}/${f}`), true); }
  catch (e) { errors.push(`${e.message}`); }
  const out: Theme[] = [];
  found.forEach((t: Theme): void => { out.push(t); });
  themes = out.sort((a: Theme, b: Theme) => a.own !== b.own ? (a.own ? 1 : -1) : a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

/** Uses a theme: its colours in its scheme, now (the nodes that use them are recoloured); kept for the next start. */
export function useTheme(id: string): void {
  let t: Theme | null = null;
  for (const x of themes) if (x.id === id) t = x;
  const chosen = t !== null ? t : fallback();
  theme = chosen;
  defineColors(chosen.scheme, chosen.colors);
  ui.setScheme(chosen.scheme);
  if (t !== null) storage.set(KEY, id);
}

/** At start, before the first render: the themes, and the one chosen last (Discord dark the first time). */
export function startThemes(): void {
  loadThemes();
  const saved = env('DISCORD_THEME') !== '' ? env('DISCORD_THEME') : storage.get(KEY);   // DISCORD_THEME: a theme chosen for a frame or a test
  useTheme(saved !== '' ? saved : 'discord-dark');
}

/** A token's colour now (for icons, which take a number). */
export function color(token: string): i32 { return theme.colors[TOKENS.indexOf(token)]; }
/** A token for the text runs of setTextRuns: follows the scheme. */
export function runColor(token: string): i32 { return ui.schemeColor(varName(token)); }
/** The rounded corners of the composer, code blocks and cards. */
export function rounded(): string { return `rounded-[${theme.radius}]`; }
/** The size and font of a message's text. */
export function textClass(): string { return `text-[${theme.textSize}px]${theme.font !== '' ? ` font-[${theme.font}]` : ''}`; }
export function compact(): boolean { return theme.density === 'compact'; }
