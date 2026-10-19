// ============================================================================
// components/primitives.ts — Graphic primitives: texts, icons and cards
// ============================================================================
// This module gathers the basic drawing blocks used by all the
// components of the display tree:
// - Texts truncated with an ellipsis (`fitTextToWidth`, `drawLabel`)
// - Centred and multi-line texts (`drawCenteredText`, `drawWrappedText`)
// - Tabular fixed-width digits (`drawTabularText`) so that clocks
//   never jitter as the seconds tick
// - Lucide vector icons (`drawGlyph`) and geometric transport icons
// - Rounded cards, drop shadows and iOS separators.

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
// Text measuring and drawing
// ----------------------------------------------------------------------------

/**
 * Cuts the string `text` with `…` if it exceeds `maxWidth` pixels.
 * Uses a fast binary search.
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

/** Cache of the maximum width of a digit (0..9) for each font. */
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
 * Measures the width of a string giving every digit the same fixed width.
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
 * Draws a string with fixed-width digits (ideal for clocks and counters).
 * Returns the total width used.
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
 * Draws a line of text aligned by its top `y`, truncated to `maxWidth`.
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
 * Draws a line of text centred horizontally around `centerX`.
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
 * Draws a paragraph wrapped at spaces on at most `maxLines` lines,
 * with a line height of `lineHeight`. The last line is truncated with `…`.
 * Returns the total height taken.
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
 * Formats a duration in seconds as `m:ss` (e.g. `3:05`).
 */
export function formatDurationClock(totalSeconds: number): string {
  const clampedSeconds = Math.max(0, Math.floor(totalSeconds)) as i32;
  const minutes = Math.floor(clampedSeconds / 60) as i32;
  const remainingSeconds = clampedSeconds % 60;
  return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
}

// ----------------------------------------------------------------------------
// Lucide vector icons and transport symbols
// ----------------------------------------------------------------------------

/**
 * Draws a Lucide icon by name.
 * Note: `zinc:svg` ignores `setTransform`, so `uiState.offsetX / offsetY` is added to it.
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
 * Draws a solid playback control icon (`play`, `pause`, `next`, `prev`)
 * as sharp polygons centred at `(centerX, centerY)`.
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
// Cards, separators, shadows and page headers
// ----------------------------------------------------------------------------

/** Draws a rounded card background in the style of iOS grouped lists. */
export function drawCardBackground(x: number, y: number, width: number, height: number): void {
  rrect(x, y, width, height, 14, COLOR_CARD, 255);
}

/** Draws a 1-pixel horizontal separator line. */
export function drawSeparatorLine(x: number, y: number, width: number): void {
  rect(x, y, width, 1, COLOR_SEPARATOR);
}

/** Draws a soft drop shadow under a card or a cover. */
export function drawCardShadow(x: number, y: number, width: number, height: number, cornerRadius: number): void {
  shadow(x, y + 10, width, height, cornerRadius, 30, 0x000000, 150);
}

/** Draws the large title at the top left of a page (`x = sidebarWidth + PAGE_PADDING`). */
export function drawPageHeader(title: string, sidebarWidth: number): void {
  drawText(Fonts.hero, sidebarWidth + PAGE_PADDING, 30, title, COLOR_TEXT_PRIMARY, 255, 0);
}
