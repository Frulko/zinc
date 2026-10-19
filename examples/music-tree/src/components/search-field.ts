// ============================================================================
// components/search-field.ts — Barre de recherche interactive
// ============================================================================

import { rrect, rect, drawText, textWidth } from 'zinc:gfx';
import {
  COLOR_ACCENT,
  COLOR_CARD_ELEVATED,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  COLOR_TEXT_TERTIARY,
} from '../constants';
import { Fonts } from '../fonts';
import { registerTapZone } from '../core/input';
import { drawGlyph, drawLabel } from './primitives';
import { drawIconButton } from './buttons';

/**
 * Dessine un champ de saisie de recherche avec loupe, texte d'invite (placeholder),
 * curseur d'insertion et bouton d'effacement rapide.
 */
export function drawSearchField(
  x: number,
  y: number,
  width: number,
  placeholder: string,
  currentText: string,
  isTypingActive: boolean,
  onFocusField: () => void,
  onClearText: () => void
): void {
  rrect(x, y, width, 46, 12, COLOR_CARD_ELEVATED, 255);
  drawGlyph('search', x + 14, y + 13, 20, COLOR_TEXT_SECONDARY);

  if (currentText === '') {
    drawText(Fonts.label, x + 46, y + 13, placeholder, COLOR_TEXT_TERTIARY, 255, 0);
  } else {
    drawLabel(Fonts.label, x + 46, y + 13, currentText, COLOR_TEXT_PRIMARY, width - 100);
  }

  if (isTypingActive) {
    const caretX = x + 47 + Math.min(width - 100, textWidth(Fonts.label, currentText, 0));
    rect(caretX, y + 11, 2, 24, COLOR_ACCENT);
  }

  registerTapZone('field', x, y, width - 50, 46, onFocusField);

  if (currentText !== '') {
    drawIconButton('field/clear', 'x', x + width - 26, y + 23, 18, COLOR_TEXT_SECONDARY, () => {
      onClearText();
      onFocusField();
    });
  }
}
