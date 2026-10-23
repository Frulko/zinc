// ============================================================================
// fonts.ts — Named fonts of the player, created once at startup
// ============================================================================

import { font } from 'zinc:gfx';

export const Fonts = {
  hero: font('sans-bold', 54),
  title: font('sans-bold', 26),
  heading: font('sans-bold', 20),
  body: font('sans', 18),
  bodyBold: font('sans-bold', 18),
  label: font('sans', 16),
  labelBold: font('sans-bold', 16),
  small: font('sans', 14),
  /** A command to type and an app's output: Inter too (the baked families are sans and sans-bold). */
  code: font('sans', 16),
  codeSmall: font('sans', 14),
  pairingCode: font('sans-bold', 44),
  keyboardKey: font('sans', 22),
};
