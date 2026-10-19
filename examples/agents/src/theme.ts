// Colours (0xRRGGBB) and the class helpers that turn them into zinc:ui classes: `bg(SURFACE)` is `bg-[#1e1f24]`.
export const BACKGROUND = 0x16171b;
export const SURFACE = 0x1e1f24;
export const SURFACE_HOVER = 0x2a2c33;
export const SELECTED = 0x31343d;
export const BORDER = 0x2e3038;
export const TEXT = 0xe6e7eb;
export const MUTED = 0x9ea2ad;
export const FAINT = 0x6b6f7a;
export const USER_BUBBLE = 0x2b3a55;
export const ERROR = 0xe5737a;
export const SUCCESS = 0x8cc98f;

const HEX = '0123456789abcdef';
function hex(c: i32): string {
  let s = '';
  for (let shift = 20; shift >= 0; shift -= 4) s += HEX.charAt((c >> shift) & 15);
  return `[#${s}]`;
}
export function bg(c: i32): string { return `bg-${hex(c)}`; }
export function fg(c: i32): string { return `text-${hex(c)}`; }
export function bd(c: i32): string { return `border-${hex(c)}`; }

/** `1234` bytes → `1.2 KB`; a folder's size is its number of entries. */
export function sizeLabel(size: i32, isDirectory: boolean): string {
  if (isDirectory) return size === 1 ? '1 item' : `${size} items`;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 102.4) / 10} KB`;
  return `${Math.round(size / 104857.6) / 10} MB`;
}
