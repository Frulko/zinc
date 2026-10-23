// ============================================================================
// fonts.ts — Fonts of the Music application
// ============================================================================
// Each font is created once at startup through zinc:gfx.
// The explicit names show at once the typographic role
// of each style in the components and the pages.

import { font } from 'zinc:gfx';

const FONT_HERO: i32 = font('sans-bold', 34);
const FONT_TITLE: i32 = font('sans-bold', 28);
const FONT_HEADING: i32 = font('sans-bold', 22);
const FONT_BODY: i32 = font('sans', 20);
const FONT_BODY_BOLD: i32 = font('sans-bold', 18);
const FONT_LABEL: i32 = font('sans', 17);
const FONT_SMALL: i32 = font('sans', 15);
const FONT_SMALL_BOLD: i32 = font('sans-bold', 15);
const FONT_TINY: i32 = font('sans', 13);
const FONT_TINY_BOLD: i32 = font('sans-bold', 12);
const FONT_KEYBOARD_KEY: i32 = font('sans', 24);

// Large fonts for the StandBy clock, the weather and the notifications
export const FONT_CLOCK_HUGE: i32 = font('sans-bold', 250);
export const FONT_CLOCK_COMPACT: i32 = font('sans-bold', 120);
export const FONT_CLOCK_SMALL: i32 = font('sans-bold', 80);
export const FONT_ODOMETER_DIGIT: i32 = font('sans-bold', 170);
export const FONT_WEATHER_TEMP: i32 = font('sans', 120);
export const FONT_PAIRING_CODE: i32 = font('sans-bold', 96);
export const FONT_STANDBY_SENDER: i32 = font('sans-bold', 54);
export const FONT_STANDBY_NAME: i32 = font('sans-bold', 34);
export const FONT_STANDBY_EXCERPT: i32 = font('sans', 32);
export const FONT_STANDBY_META: i32 = font('sans', 22);

/** Convenient grouping of the interface's standard fonts. */
export const Fonts = {
  hero: FONT_HERO,
  title: FONT_TITLE,
  heading: FONT_HEADING,
  body: FONT_BODY,
  bodyBold: FONT_BODY_BOLD,
  label: FONT_LABEL,
  small: FONT_SMALL,
  smallBold: FONT_SMALL_BOLD,
  tiny: FONT_TINY,
  tinyBold: FONT_TINY_BOLD,
  keyboardKey: FONT_KEYBOARD_KEY,
};
