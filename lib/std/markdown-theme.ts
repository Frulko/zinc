// Shared Markdown colours follow the current scheme without rebuilding text runs.
import * as ui from 'zinc:ui';
const NAMES = ['mdSurface', 'mdBar', 'mdHover', 'mdBorder', 'mdText', 'mdMuted', 'mdFaint', 'mdCode', 'mdAccent', 'mdCodeFg'];
const DARK: i32[] = [0x1c1d22, 0x121316, 0x2a2c33, 0x2c2e36, 0xe6e7eb, 0x9ea2ad, 0x6b6f7a, 0x111215, 0x6e8efb, 0xe3a57a];
const LIGHT: i32[] = [0xf6f7f9, 0xeceef1, 0xe6e8ec, 0xdcdfe4, 0x1f2328, 0x57606a, 0x8c959f, 0xf3f4f6, 0x3d63dd, 0xb3501d];
ui.defineScheme('dark', NAMES, DARK); ui.defineScheme('light', NAMES, LIGHT);
export const SURFACE = 0, BAR = 1, SURFACE_HOVER = 2, BORDER = 3, TEXT = 4, MUTED = 5, FAINT = 6, CODE = 7, ACCENT = 8, CODE_TEXT = 9;
function variable(c: i32): string { return '[var(--' + NAMES[c] + ')]'; }
export function varName(c: i32): string { return NAMES[c]; }
export function bg(c: i32): string { return 'bg-' + variable(c); }
export function fg(c: i32): string { return 'text-' + variable(c); }
export function bd(c: i32): string { return 'border-' + variable(c); }
export function color(c: i32): i32 { return ui.currentScheme() === 'light' ? LIGHT[c] : DARK[c]; }
