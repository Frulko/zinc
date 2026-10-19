// ============================================================================
// components/buttons.ts — Boutons : icône ronde, pilule et contrôle segmenté
// ============================================================================
// Chaque fonction dessine le contrôle dans le repère du `DisplayObject` courant
// et enregistre automatiquement sa zone tactile (`registerTapZone`).

import { rrect, drawText, textWidth, fontAscent } from 'zinc:gfx';
import {
  COLOR_CARD_ELEVATED,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
} from '../constants';
import { Fonts } from '../fonts';
import { registerTapZone, isZonePressed } from '../core/input';
import { drawGlyph, drawCenteredText } from './primitives';

/**
 * Dessine un bouton circulaire contenant une icône Lucide centrée en `(centerX, centerY)`.
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
 * Dessine un bouton en forme de capsule (pilule) avec un texte et une icône optionnelle.
 * Retourne la largeur totale du bouton dessiné.
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
  height: number = 40
): number {
  const fontId = Fonts.smallBold;
  const horizontalPadding = 18;
  const iconAdvance = iconName !== '' ? 22 : 0;
  const buttonWidth = textWidth(fontId, label, 0) + horizontalPadding * 2 + iconAdvance;

  rrect(x, y, buttonWidth, height, height / 2, backgroundColor, isZonePressed(zoneId) ? 170 : 255);
  if (iconName !== '') {
    drawGlyph(iconName, x + horizontalPadding - 4, y + (height - 18) / 2, 18, foregroundColor);
  }
  drawText(
    fontId,
    x + horizontalPadding + iconAdvance,
    y + (height - fontAscent(fontId)) / 2 - 1,
    label,
    foregroundColor,
    255,
    0
  );
  registerTapZone(zoneId, x, y, buttonWidth, height, onTap);
  return buttonWidth;
}

/**
 * Dessine un contrôle segmenté de style iOS (barre d'onglets).
 * Retourne la largeur totale du contrôle.
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
      segmentLabels[index],
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
