// ============================================================================
// components/primitives.ts — Primitives graphiques : textes, icônes et cartes
// ============================================================================
// Ce module regroupe les briques élémentaires de dessin utilisées par tous les
// composants de l'arbre d'affichage :
// - Textes tronqués avec points de suspension (`fitTextToWidth`, `drawLabel`)
// - Textes centrés et multilignes (`drawCenteredText`, `drawWrappedText`)
// - Chiffres tabulaires à chasse fixe (`drawTabularText`) pour que les horloges
//   ne tremblent jamais lorsque les secondes défilent
// - Icônes vectorielles Lucide (`drawGlyph`) et icônes géométriques de transport
// - Cartes arrondies, ombres portées et séparateurs iOS.

import { rrect, rect, drawText, textWidth, fontAscent, shadow, polygon } from 'zinc:gfx';
import { icon } from 'zinc:icons';
import {
  COLOR_CARD,
  COLOR_SEPARATOR,
  COLOR_TEXT_PRIMARY,
  PAGE_PADDING,
} from '../constants';
import { Fonts } from '../fonts';
import { uiState } from '../core/input';

// ----------------------------------------------------------------------------
// Mesure et dessin de texte
// ----------------------------------------------------------------------------

/**
 * Coupe la chaîne `text` avec `…` si elle dépasse `maxWidth` pixels.
 * Utilise une recherche dichotomique rapide.
 */
export function fitTextToWidth(fontId: i32, text: string, maxWidth: number): string {
  if (textWidth(fontId, text, 0) <= maxWidth) return text;
  let lowIndex: i32 = 0;
  let highIndex: i32 = text.length as i32;
  while (lowIndex < highIndex) {
    const midIndex = Math.ceil((lowIndex + highIndex) / 2) as i32;
    if (textWidth(fontId, text.slice(0, midIndex) + '…', 0) <= maxWidth) {
      lowIndex = midIndex;
    } else {
      highIndex = midIndex - 1;
    }
  }
  return text.slice(0, lowIndex).trimEnd() + '…';
}

/** Cache de la largeur maximale d'un chiffre (0..9) pour chaque police. */
const tabularDigitWidthByFont = new Map<i32, number>();

function getTabularDigitCellWidth(fontId: i32): number {
  const cachedWidth = tabularDigitWidthByFont.get(fontId);
  if (cachedWidth !== undefined) return cachedWidth as number;
  let widestDigit = 0;
  for (let digit = 0; digit < 10; digit++) {
    widestDigit = Math.max(widestDigit, textWidth(fontId, '' + digit, 0));
  }
  tabularDigitWidthByFont.set(fontId, widestDigit);
  return widestDigit;
}

/**
 * Mesure la largeur d'une chaîne en attribuant la même chasse fixe à chaque chiffre.
 */
export function measureTabularWidth(fontId: i32, text: string): number {
  let totalWidth = 0;
  const digitCellWidth = getTabularDigitCellWidth(fontId);
  for (let index = 0; index < text.length; index++) {
    const character = text.charAt(index);
    const isDigit = character >= '0' && character <= '9';
    totalWidth += isDigit ? digitCellWidth : textWidth(fontId, character, 0);
  }
  return totalWidth;
}

/**
 * Dessine une chaîne avec des chiffres à chasse fixe (idéal pour les horloges et compteurs).
 * Retourne la largeur totale utilisée.
 */
export function drawTabularText(
  fontId: i32,
  x: number,
  y: number,
  text: string,
  color: u32,
  alpha: i32 = 255
): number {
  const digitCellWidth = getTabularDigitCellWidth(fontId);
  let cursorX = x;
  for (let index = 0; index < text.length; index++) {
    const character = text.charAt(index);
    const isDigit = character >= '0' && character <= '9';
    const charWidth = textWidth(fontId, character, 0);
    const drawX = isDigit ? cursorX + (digitCellWidth - charWidth) / 2 : cursorX;
    drawText(fontId, drawX, y, character, color, alpha, 0);
    cursorX += isDigit ? digitCellWidth : charWidth;
  }
  return cursorX - x;
}

/**
 * Dessine une ligne de texte alignée par son sommet `y`, tronquée à `maxWidth`.
 */
export function drawLabel(
  fontId: i32,
  x: number,
  y: number,
  text: string,
  color: u32,
  maxWidth: number = 10000,
  alpha: i32 = 255
): void {
  drawText(fontId, x, y, fitTextToWidth(fontId, text, maxWidth), color, alpha, 0);
}

/**
 * Dessine une ligne de texte centrée horizontalement autour de `centerX`.
 */
export function drawCenteredText(
  fontId: i32,
  centerX: number,
  y: number,
  text: string,
  color: u32,
  alpha: i32 = 255
): void {
  drawText(fontId, centerX - textWidth(fontId, text, 0) / 2, y, text, color, alpha, 0);
}

/**
 * Dessine un paragraphe découpé aux espaces sur au plus `maxLines` lignes,
 * avec une hauteur de ligne `lineHeight`. La dernière ligne est tronquée avec `…`.
 * Retourne la hauteur totale occupée.
 */
export function drawWrappedText(
  fontId: i32,
  x: number,
  y: number,
  text: string,
  color: u32,
  maxWidth: number,
  maxLines: i32,
  lineHeight: number,
  alpha: i32 = 255
): number {
  const words = text.split(' ');
  let currentLine = '';
  let lineIndex: i32 = 0;

  for (let wordIndex = 0; wordIndex < words.length; wordIndex++) {
    const candidateLine = currentLine === '' ? words[wordIndex] : currentLine + ' ' + words[wordIndex];
    if (textWidth(fontId, candidateLine, 0) <= maxWidth || currentLine === '') {
      currentLine = candidateLine;
      continue;
    }
    if (lineIndex === maxLines - 1) {
      currentLine = words.slice(wordIndex - currentLine.split(' ').length).join(' ');
      break;
    }
    drawText(fontId, x, y + lineIndex * lineHeight, currentLine, color, alpha, 0);
    lineIndex++;
    currentLine = words[wordIndex];
  }

  if (currentLine !== '') {
    drawText(fontId, x, y + lineIndex * lineHeight, fitTextToWidth(fontId, currentLine, maxWidth), color, alpha, 0);
    lineIndex++;
  }
  return lineIndex * lineHeight;
}

/**
 * Formate une durée en secondes sous la forme `m:ss` (ex: `3:05`).
 */
export function formatDurationClock(totalSeconds: number): string {
  const clampedSeconds = Math.max(0, Math.floor(totalSeconds)) as i32;
  const minutes = Math.floor(clampedSeconds / 60) as i32;
  const remainingSeconds = clampedSeconds % 60;
  return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
}

// ----------------------------------------------------------------------------
// Icônes vectorielles Lucide et symboles de transport
// ----------------------------------------------------------------------------

/**
 * Dessine une icône Lucide par son nom.
 * Note : `zinc:svg` ignorant `setTransform`, on lui additionne `uiState.offsetX / offsetY`.
 */
export function drawGlyph(
  iconName: string,
  x: number,
  y: number,
  size: number,
  color: u32,
  alpha: i32 = 255,
  strokeWidth: number = 2
): void {
  const svgIcon = icon(iconName, color as i32, strokeWidth);
  if (svgIcon !== null) {
    svgIcon.draw(x + uiState.offsetX, y + uiState.offsetY, size, size, alpha);
  }
}

/**
 * Dessine une icône de contrôle de lecture pleine (`play`, `pause`, `next`, `prev`)
 * sous forme de polygones nets centrés en `(centerX, centerY)`.
 */
export function drawTransportIcon(
  kind: string,
  centerX: number,
  centerY: number,
  size: number,
  color: u32
): void {
  if (kind === 'play') {
    polygon(
      [
        centerX - size * 0.38,
        centerY - size * 0.5,
        centerX + size * 0.5,
        centerY,
        centerX - size * 0.38,
        centerY + size * 0.5,
      ],
      color,
      255
    );
    return;
  }
  if (kind === 'pause') {
    rrect(centerX - size * 0.42, centerY - size * 0.5, size * 0.3, size, size * 0.08, color, 255);
    rrect(centerX + size * 0.12, centerY - size * 0.5, size * 0.3, size, size * 0.08, color, 255);
    return;
  }
  if (kind === 'next' || kind === 'prev') {
    const direction = kind === 'next' ? 1 : -1;
    const halfHeight = size * 0.42;
    polygon(
      [
        centerX - direction * size * 0.5,
        centerY - halfHeight,
        centerX,
        centerY,
        centerX - direction * size * 0.5,
        centerY + halfHeight,
      ],
      color,
      255
    );
    polygon(
      [
        centerX,
        centerY - halfHeight,
        centerX + direction * size * 0.5,
        centerY,
        centerX,
        centerY + halfHeight,
      ],
      color,
      255
    );
    const barX = kind === 'next' ? centerX + size * 0.5 : centerX - size * 0.5 - size * 0.1;
    rrect(barX, centerY - halfHeight, size * 0.1, halfHeight * 2, 1, color, 255);
  }
}

// ----------------------------------------------------------------------------
// Cartes, séparateurs, ombres et en-têtes de page
// ----------------------------------------------------------------------------

/** Dessine un fond de carte arrondi au style des listes groupées iOS. */
export function drawCardBackground(x: number, y: number, width: number, height: number): void {
  rrect(x, y, width, height, 14, COLOR_CARD, 255);
}

/** Dessine une ligne de séparation horizontale de 1 pixel. */
export function drawSeparatorLine(x: number, y: number, width: number): void {
  rect(x, y, width, 1, COLOR_SEPARATOR);
}

/** Dessine une ombre portée douce sous une carte ou une pochette. */
export function drawCardShadow(x: number, y: number, width: number, height: number, cornerRadius: number): void {
  shadow(x, y + 10, width, height, cornerRadius, 30, 0x000000, 150);
}

/** Dessine le grand titre en haut à gauche d'une page (`x = sidebarWidth + PAGE_PADDING`). */
export function drawPageHeader(title: string, sidebarWidth: number): void {
  drawText(Fonts.hero, sidebarWidth + PAGE_PADDING, 30, title, COLOR_TEXT_PRIMARY, 255, 0);
}
