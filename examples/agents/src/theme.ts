// Colours, as two zinc:ui colour schemes (dark and light) whose variables the class helpers name: `bg(SURFACE)` is
// `bg-[var(--agSurface)]`, so switching the scheme restyles the nodes without re-rendering a component. `color(TEXT)`
// is the value in the current scheme, for what is drawn rather than styled (icons).
import * as ui from 'zinc:ui';

const NAMES = ['agBg', 'agSurface', 'agBar', 'agHover', 'agSel', 'agBorder', 'agText', 'agMuted', 'agFaint', 'agUser', 'agError',
  'agOk', 'agWarn', 'agCode', 'agAccent'];
const DARK: i32[] = [0x16171b, 0x1c1d22, 0x121316, 0x2a2c33, 0x31343d, 0x2c2e36, 0xe6e7eb, 0x9ea2ad, 0x6b6f7a, 0x2b3a55, 0xe5737a,
  0x8cc98f, 0xe8b34b, 0x111215, 0x6e8efb];
const LIGHT: i32[] = [0xffffff, 0xf6f7f9, 0xeceef1, 0xe6e8ec, 0xdde2ea, 0xdcdfe4, 0x1f2328, 0x57606a, 0x8c959f, 0xdbe7fb, 0xcf222e,
  0x1a7f37, 0x9a6700, 0xf3f4f6, 0x3d63dd];
ui.defineScheme('dark', NAMES, DARK);
ui.defineScheme('light', NAMES, LIGHT);

export const BACKGROUND = 0, SURFACE = 1, BAR = 2, SURFACE_HOVER = 3, SELECTED = 4, BORDER = 5, TEXT = 6, MUTED = 7, FAINT = 8,
  USER_BUBBLE = 9, ERROR = 10, SUCCESS = 11, WARN = 12, CODE = 13, ACCENT = 14;

/** The window's clear colour before the tree paints (the root view has its own background). */
export const CLEAR_COLOR = DARK[0];

function v(c: i32): string { return `[var(--${NAMES[c]})]`; }
export function bg(c: i32): string { return `bg-${v(c)}`; }
export function fg(c: i32): string { return `text-${v(c)}`; }
export function bd(c: i32): string { return `border-${v(c)}`; }
/** The colour of `c` in the scheme shown now (0xRRGGBB). */
export function color(c: i32): i32 { return ui.currentScheme() === 'light' ? LIGHT[c] : DARK[c]; }

/** `1234` → `1.2 KB` (texts are counted in characters, about bytes for code and logs); a folder's size is its number of entries. */
export function sizeLabel(size: number, isDirectory: boolean): string {
  if (isDirectory) return size === 1 ? '1 item' : `${size} items`;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 102.4) / 10} KB`;
  return `${Math.round(size / 104857.6) / 10} MB`;
}

/** `now`, `4 min`, `2 h`, `3 d`: how long ago `ms` (epoch) was. */
export function ago(ms: number, now: number): string {
  const s = Math.max(0, Math.floor((now - ms) / 1000));
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return `${Math.floor(s / 86400)} d`;
}

/** `850 ms`, `12 s`, `3 min 4 s`. */
export function duration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}
