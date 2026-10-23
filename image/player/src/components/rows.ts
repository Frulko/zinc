// ============================================================================
// components/rows.ts — The blocks of the settings sections
// ============================================================================

import { lineHeight, rrect, textWidth } from 'zinc:gfx';
import {
  COLOR_CARD,
  COLOR_CARD_PRESSED,
  COLOR_DANGER,
  COLOR_SUCCESS,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  CORNER_RADIUS,
  ROW_HEIGHT,
} from '../constants';
import { Fonts } from '../fonts';
import { isZoneFocused, isZonePressed, registerTapZone } from '../core/input';
import { drawFocusRing, drawGlyph, drawLabel } from './primitives';

export const SECTION_HEADING_HEIGHT = 40;

/** The section's title. */
export function drawSectionHeading(x: number, y: number, title: string): void {
  drawLabel(Fonts.title, x, y, title, COLOR_TEXT_PRIMARY);
}

/**
 * Draws a row card (`ROW_HEIGHT` high) with a title and a line under it, leaving `controlWidth` on the right for its
 * control. With `onTap` the whole row is a button.
 */
export function drawSettingRow(
  zoneId: string,
  x: number,
  y: number,
  width: number,
  title: string,
  subtitle: string,
  controlWidth: number,
  onTap: (() => void) | null = null
): void {
  const isPressed = onTap !== null && isZonePressed(zoneId);
  rrect(x, y, width, ROW_HEIGHT, CORNER_RADIUS, isPressed ? COLOR_CARD_PRESSED : COLOR_CARD, 255);
  if (onTap !== null && isZoneFocused(zoneId)) drawFocusRing(x, y, width, ROW_HEIGHT, CORNER_RADIUS);
  const textWidthLeft = width - 32 - controlWidth;
  if (subtitle === '') {
    drawLabel(Fonts.bodyBold, x + 16, y + (ROW_HEIGHT - lineHeight(Fonts.bodyBold)) / 2, title, COLOR_TEXT_PRIMARY, textWidthLeft);
  } else {
    drawLabel(Fonts.labelBold, x + 16, y + 7, title, COLOR_TEXT_PRIMARY, textWidthLeft);
    drawLabel(Fonts.small, x + 16, y + 28, subtitle, COLOR_TEXT_SECONDARY, textWidthLeft);
  }
  if (onTap !== null) registerTapZone(zoneId, x, y, width, ROW_HEIGHT, onTap as () => void);
}

/** A "label  value" line of the system section; returns its height. */
export function drawValueLine(x: number, y: number, width: number, label: string, value: string): number {
  const labelWidth = Math.min(150, width * 0.32);
  drawLabel(Fonts.label, x, y, label, COLOR_TEXT_SECONDARY, labelWidth - 8);
  drawLabel(Fonts.label, x + labelWidth, y, value === '' ? '—' : value, COLOR_TEXT_PRIMARY, width - labelWidth);
  return 28;
}

/** The sentence an action left (red for an error); returns its height (0 when there is none). */
export function drawMessage(x: number, y: number, width: number, text: string, isError: boolean): number {
  if (text === '') return 0;
  const color = isError ? COLOR_DANGER : COLOR_SUCCESS;
  drawGlyph(isError ? 'triangle-alert' : 'circle-check', x, y + 1, 16, color);
  drawLabel(Fonts.small, x + 22, y, text, color, width - 22);
  return 26;
}

/** The width of a text in the label font, to place what follows it. */
export function labelWidth(text: string): number {
  return textWidth(Fonts.label, text, 0);
}
