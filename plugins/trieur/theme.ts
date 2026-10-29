// The deck's colours, as 0xRRGGBB: a night stage with bright folders, or a paper one. THEME reads the palette shown, through a signal, so
// that what reads it (styles, the carving) follows a switch without being rebuilt.

import * as ui from 'zinc:ui';
import { createSignal } from 'zinc:ui/solid';
import type { Zone } from '@trieur/core';

const DARK = {
  bg: 0x0b0e22,
  side: 0x0a0d1f,
  card: 0x171b36,
  cardLine: 0x2c3264,
  tileBg: 0x161a33,
  ink: 0xe8eaff,
  body: 0xa9aed6,
  dim: 0x8d93c4,
  line: 0x5a6199,
  keycap: 0x252a52,
  chip: 0x1d2246,
  tag: 0x262c55,
  tagInk: 0xc4c8f0,
  accent: 0x7c83ff,
  accentSoft: 0x262c63,
  /** multi-zone mode: amber rather than red (trieur: red reads as an error, this is a mode) */
  multi: 0xf59e0b,
  multiInk: 0x1a1205,
};
export type Palette = typeof DARK;
const LIGHT: Palette = {
  bg: 0xeef0f8, side: 0xf6f7fc, card: 0xffffff, cardLine: 0xdfe2f0, tileBg: 0xf3f4fb, ink: 0x1b1e3a, body: 0x4a4f74, dim: 0x6b7094,
  line: 0xb4b9d6, keycap: 0xeceef8, chip: 0xffffff, tag: 0xeef0fb, tagInk: 0x4a4f74, accent: 0x5b63f0, accentSoft: 0xe2e4ff,
  multi: 0xf59e0b, multiInk: 0x1a1205,
};

const [palette, setPalette] = createSignal<Palette>(ui.currentScheme() === 'light' ? LIGHT : DARK);   // zinc.json "scheme" decides
export const THEME = {} as Palette;
for (const k of Object.keys(DARK) as Array<keyof Palette>) Object.defineProperty(THEME, k, { get: () => palette()[k], enumerable: true });

/** Changes some colours of the palette shown. */
export function setTheme(patch: Partial<Palette>): void { setPalette({ ...palette(), ...patch }); }
/** 'dark', 'light', or 'auto' for the system's; the window's scheme (zinc.json "scheme", `dark:` classes) follows. */
export function setScheme(name: 'dark' | 'light' | 'auto'): void {
  ui.setScheme(name);
  setPalette(ui.currentScheme() === 'light' ? LIGHT : DARK);
}
export function isDark(): boolean { return palette() !== LIGHT; }

/** A zone's colour, '#4a54f2' or '#45f', as 0xRRGGBB; the accent when it has none. */
export function colorOf(z: Zone): number {
  const c = z.color ?? '';
  if (/^#[0-9a-f]{6}$/i.test(c)) return parseInt(c.slice(1), 16);
  if (/^#[0-9a-f]{3}$/i.test(c)) return parseInt(c.slice(1).split('').map((d) => d + d).join(''), 16);
  return THEME.accent;
}
