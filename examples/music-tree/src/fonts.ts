// ============================================================================
// fonts.ts — Polices de caractères de l'application Musique
// ============================================================================
// Chaque police est créée une seule fois au démarrage via zinc:gfx.
// Les noms explicites permettent de comprendre immédiatement le rôle
// typographique de chaque style dans les composants et les pages.

import { font } from 'zinc:gfx';

export const FONT_HERO: i32 = font('sans-bold', 34);
export const FONT_TITLE: i32 = font('sans-bold', 28);
export const FONT_HEADING: i32 = font('sans-bold', 22);
export const FONT_BODY: i32 = font('sans', 20);
export const FONT_BODY_BOLD: i32 = font('sans-bold', 18);
export const FONT_LABEL: i32 = font('sans', 17);
export const FONT_SMALL: i32 = font('sans', 15);
export const FONT_SMALL_BOLD: i32 = font('sans-bold', 15);
export const FONT_TINY: i32 = font('sans', 13);
export const FONT_TINY_BOLD: i32 = font('sans-bold', 12);
export const FONT_KEYBOARD_KEY: i32 = font('sans', 24);

// Polices de grande taille pour l'horloge StandBy, la météo et les notifications
export const FONT_CLOCK_HUGE: i32 = font('sans-bold', 250);
export const FONT_ODOMETER_DIGIT: i32 = font('sans-bold', 170);
export const FONT_WEATHER_TEMP: i32 = font('sans', 120);
export const FONT_PAIRING_CODE: i32 = font('sans-bold', 96);
export const FONT_STANDBY_SENDER: i32 = font('sans-bold', 54);
export const FONT_STANDBY_NAME: i32 = font('sans-bold', 34);
export const FONT_STANDBY_EXCERPT: i32 = font('sans', 32);
export const FONT_STANDBY_META: i32 = font('sans', 22);

/** Regroupement pratique des polices standards de l'interface. */
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
