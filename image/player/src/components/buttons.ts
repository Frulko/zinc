// ============================================================================
// components/buttons.ts — Buttons, icon buttons and switches
// ============================================================================
// Each function draws the control in the frame of the current `DisplayObject` and registers its touch zone, which
// the keyboard focus also reaches (Tab, then Enter).

import { lineHeight, rrect, textWidth } from 'zinc:gfx';
import {
  BUTTON_HEIGHT,
  COLOR_ACCENT,
  COLOR_CARD_PRESSED,
  COLOR_DANGER,
  COLOR_KEY,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  COLOR_WHITE,
} from '../constants';
import { Fonts } from '../fonts';
import { isZoneFocused, isZonePressed, registerTapZone } from '../core/input';
import { drawFocusRing, drawGlyph, drawLabel } from './primitives';

export const BUTTON_PRIMARY: i32 = 0;
export const BUTTON_SECONDARY: i32 = 1;
/** White, on the coloured home page. */
export const BUTTON_LIGHT: i32 = 2;
/** Translucent white, on the coloured home page. */
export const BUTTON_GLASS: i32 = 3;
export const BUTTON_DANGER: i32 = 4;

const BUTTON_PADDING = 18;
const BUTTON_ICON_SIZE = 20;
const BUTTON_ICON_GAP = 8;
const LIGHT_BUTTON_TEXT_COLOR: u32 = 0x1c1e27;

/** The width `drawButton` gives `label` (and its icon) when it is not told one. */
export function measureButton(label: string, iconName: string): number {
  const iconWidth = iconName === '' ? 0 : BUTTON_ICON_SIZE + (label === '' ? 0 : BUTTON_ICON_GAP);
  return Math.ceil(BUTTON_PADDING * 2 + iconWidth + textWidth(Fonts.labelBold, label, 0));
}

/**
 * Draws a button of `BUTTON_HEIGHT` at (`x`, `y`), `width` wide (0: as wide as its label). A disabled button is drawn
 * faded and takes no tap. Returns its width.
 */
export function drawButton(
  zoneId: string,
  x: number,
  y: number,
  width: number,
  label: string,
  iconName: string,
  style: i32,
  onTap: () => void,
  isEnabled: boolean = true
): number {
  const buttonWidth = width > 0 ? width : measureButton(label, iconName);
  const radius = BUTTON_HEIGHT / 2;
  let background: u32 = COLOR_ACCENT;
  let backgroundAlpha: i32 = 255;
  let foreground: u32 = COLOR_WHITE;
  if (style === BUTTON_SECONDARY) {
    background = COLOR_CARD_PRESSED;
    foreground = COLOR_TEXT_PRIMARY;
  } else if (style === BUTTON_LIGHT) {
    background = COLOR_WHITE;
    foreground = LIGHT_BUTTON_TEXT_COLOR;
  } else if (style === BUTTON_GLASS) {
    background = COLOR_WHITE;
    backgroundAlpha = 48;
  } else if (style === BUTTON_DANGER) {
    background = COLOR_DANGER;
  }
  const alpha: i32 = isEnabled ? 255 : 110;
  rrect(x, y, buttonWidth, BUTTON_HEIGHT, radius, background, isEnabled ? backgroundAlpha : (backgroundAlpha * 110) / 255);
  if (isEnabled && isZonePressed(zoneId)) {
    rrect(x, y, buttonWidth, BUTTON_HEIGHT, radius, style === BUTTON_LIGHT ? 0x000000 : COLOR_WHITE, 40);
  }
  if (isZoneFocused(zoneId)) drawFocusRing(x, y, buttonWidth, BUTTON_HEIGHT, radius);

  const contentWidth = measureButton(label, iconName) - BUTTON_PADDING * 2;
  let contentX = x + Math.max(BUTTON_PADDING, (buttonWidth - contentWidth) / 2);
  if (iconName !== '') {
    drawGlyph(iconName, contentX, y + (BUTTON_HEIGHT - BUTTON_ICON_SIZE) / 2, BUTTON_ICON_SIZE, foreground, alpha);
    contentX += BUTTON_ICON_SIZE + BUTTON_ICON_GAP;
  }
  if (label !== '') {
    drawLabel(Fonts.labelBold, contentX, y + (BUTTON_HEIGHT - lineHeight(Fonts.labelBold)) / 2, label, foreground, x + buttonWidth - BUTTON_PADDING - contentX, alpha);
  }
  if (isEnabled) registerTapZone(zoneId, x, y, buttonWidth, BUTTON_HEIGHT, onTap);
  return buttonWidth;
}

/** Draws a round button holding an icon, centred on (`centerX`, `centerY`). */
export function drawIconButton(
  zoneId: string,
  iconName: string,
  centerX: number,
  centerY: number,
  iconSize: number,
  iconColor: u32,
  onTap: () => void,
  backgroundAlpha: i32 = 0
): void {
  const radius = iconSize / 2 + 10;
  if (backgroundAlpha > 0) rrect(centerX - radius, centerY - radius, radius * 2, radius * 2, radius, COLOR_WHITE, backgroundAlpha);
  if (isZonePressed(zoneId)) rrect(centerX - radius, centerY - radius, radius * 2, radius * 2, radius, COLOR_WHITE, 50);
  if (isZoneFocused(zoneId)) drawFocusRing(centerX - radius, centerY - radius, radius * 2, radius * 2, radius);
  drawGlyph(iconName, centerX - iconSize / 2, centerY - iconSize / 2, iconSize, iconColor);
  registerTapZone(zoneId, centerX - radius, centerY - radius, radius * 2, radius * 2, onTap);
}

export const SWITCH_WIDTH = 52;
export const SWITCH_HEIGHT = 30;

/** Draws an on/off switch at (`x`, `y`); a waiting switch is faded and takes no tap. */
export function drawSwitch(zoneId: string, x: number, y: number, isOn: boolean, onTap: () => void, isEnabled: boolean = true): void {
  const alpha: i32 = isEnabled ? 255 : 110;
  rrect(x, y, SWITCH_WIDTH, SWITCH_HEIGHT, SWITCH_HEIGHT / 2, isOn ? COLOR_ACCENT : COLOR_KEY, alpha);
  const knobSize = SWITCH_HEIGHT - 6;
  rrect(isOn ? x + SWITCH_WIDTH - knobSize - 3 : x + 3, y + 3, knobSize, knobSize, knobSize / 2, isOn ? COLOR_WHITE : COLOR_TEXT_SECONDARY, alpha);
  if (isZoneFocused(zoneId)) drawFocusRing(x, y, SWITCH_WIDTH, SWITCH_HEIGHT, SWITCH_HEIGHT / 2);
  if (isEnabled) registerTapZone(zoneId, x - 8, y - 8, SWITCH_WIDTH + 16, SWITCH_HEIGHT + 16, onTap);
}
