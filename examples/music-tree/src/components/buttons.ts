// ============================================================================
// components/buttons.ts — Buttons: round icon, pill and segmented control
// ============================================================================
// Each function draws the control in the frame of the current `DisplayObject`
// and automatically registers its touch zone (`registerTapZone`).

import { rrect, drawText, textWidth, fontAscent } from 'zinc:gfx';
import {
  COLOR_CARD_ELEVATED,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
} from '../constants';
import { Fonts } from '../fonts';
import { registerTapZone, isZonePressed } from 'zinc:stage';
import { drawGlyph, drawCenteredText, fitTextToWidth } from './primitives';

/**
 * Draws a round button holding a Lucide icon centred at `(centerX, centerY)`.
 */
export function drawIconButton(
  zoneId: string,
  iconName: string,
  centerX: number,
  centerY: number,
  iconSize: number,
  iconColor: u32,
  onTap: () => void,
  backgroundColor: u32 = 0,
  backgroundAlpha: i32 = 0
): void {
  const hitRadius = iconSize / 2 + 10;
  if (backgroundAlpha > 0) {
    rrect(
      centerX - hitRadius,
      centerY - hitRadius,
      hitRadius * 2,
      hitRadius * 2,
      hitRadius,
      backgroundColor,
      backgroundAlpha
    );
  }
  if (isZonePressed(zoneId)) {
    rrect(centerX - hitRadius, centerY - hitRadius, hitRadius * 2, hitRadius * 2, hitRadius, 0xffffff, 40);
  }
  drawGlyph(iconName, centerX - iconSize / 2, centerY - iconSize / 2, iconSize, iconColor);
  registerTapZone(zoneId, centerX - hitRadius, centerY - hitRadius, hitRadius * 2, hitRadius * 2, onTap);
}

/**
 * Draws a capsule (pill) shaped button with a text and an optional icon.
 * Returns the total width of the button drawn.
 */
export function drawPillButton(
  zoneId: string,
  x: number,
  y: number,
  label: string,
  foregroundColor: u32,
  backgroundColor: u32,
  onTap: () => void,
  iconName: string = '',
  height: number = 40,
  maxWidth: number = 0
): number {
  const fontId = Fonts.smallBold;
  const horizontalPadding = 18;
  const iconAdvance = iconName !== '' ? 22 : 0;
  const shown = maxWidth > 0 ? fitTextToWidth(fontId, label, maxWidth - horizontalPadding * 2 - iconAdvance) : label;
  const buttonWidth = textWidth(fontId, shown, 0) + horizontalPadding * 2 + iconAdvance;

  rrect(x, y, buttonWidth, height, height / 2, backgroundColor, isZonePressed(zoneId) ? 170 : 255);
  if (iconName !== '') {
    drawGlyph(iconName, x + horizontalPadding - 4, y + (height - 18) / 2, 18, foregroundColor);
  }
  drawText(
    fontId,
    x + horizontalPadding + iconAdvance,
    y + (height - fontAscent(fontId)) / 2 - 1,
    shown,
    foregroundColor,
    255,
    0
  );
  registerTapZone(zoneId, x, y, buttonWidth, height, onTap);
  return buttonWidth;
}

/**
 * Draws an iOS style segmented control (tab bar).
 * Returns the total width of the control.
 */
export function drawSegmentedControl(
  zoneIdPrefix: string,
  x: number,
  y: number,
  segmentLabels: string[],
  selectedIndex: i32,
  onSelectSegment: (index: i32) => void,
  fixedSegmentWidth: number = 0
): number {
  const fontId = Fonts.smallBold;
  const innerHeight = 36;
  let totalInnerWidth = 0;
  const segmentWidths: number[] = [];

  for (let index = 0; index < segmentLabels.length; index++) {
    const labelText = segmentLabels[index];
    const width = fixedSegmentWidth > 0 ? fixedSegmentWidth : textWidth(fontId, labelText, 0) + 32;
    segmentWidths.push(width);
    totalInnerWidth += width;
  }

  rrect(x, y, totalInnerWidth + 4, innerHeight + 4, 10, COLOR_CARD_ELEVATED, 255);

  let cursorX = x + 2;
  for (let index = 0; index < segmentLabels.length; index++) {
    const segmentWidth = segmentWidths[index];
    const segmentZoneId = `${zoneIdPrefix}/${index}`;

    if (index === selectedIndex) {
      rrect(cursorX, y + 2, segmentWidth, innerHeight, 8, 0x636366, 255);
    } else if (isZonePressed(segmentZoneId)) {
      rrect(cursorX, y + 2, segmentWidth, innerHeight, 8, 0xffffff, 20);
    }

    drawCenteredText(
      fontId,
      cursorX + segmentWidth / 2,
      y + 2 + (innerHeight - fontAscent(fontId)) / 2 - 1,
      fitTextToWidth(fontId, segmentLabels[index], segmentWidth - 12),
      index === selectedIndex ? COLOR_TEXT_PRIMARY : COLOR_TEXT_SECONDARY
    );

    const capturedIndex = index as i32;
    registerTapZone(segmentZoneId, cursorX, y + 2, segmentWidth, innerHeight, () => {
      onSelectSegment(capturedIndex);
    });
    cursorX += segmentWidth;
  }

  return totalInnerWidth + 4;
}
