// ============================================================================
// components/primitives.ts — Texts, icons and focus rings
// ============================================================================
// The text helpers come from examples/music-tree/src/components/primitives.ts.

import { border, drawText, textWidth } from 'zinc:gfx';
import { icon } from 'zinc:icons';
import { COLOR_FOCUS_RING } from '../constants';

/** Cuts `text` with `…` when it is wider than `maxWidth` pixels (binary search on the length). */
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

/** Draws a line of text by its top `y`, cut to `maxWidth`. */
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

/** Draws a line of text centred on `centerX`. */
export function drawCenteredText(fontId: i32, centerX: number, y: number, text: string, color: u32, alpha: i32 = 255): void {
  drawText(fontId, centerX - textWidth(fontId, text, 0) / 2, y, text, color, alpha, 0);
}

/**
 * Draws a paragraph wrapped at spaces on at most `maxLines` lines `lineHeight` apart, the last one cut with `…`.
 * Returns the height it took.
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

/** The number of lines `drawWrappedText` takes for `text` (at most `maxLines`), to lay out before drawing. */
export function countWrappedLines(fontId: i32, text: string, maxWidth: number, maxLines: i32): i32 {
  const words = text.split(' ');
  let currentLine = '';
  let lineCount: i32 = 1;
  for (let wordIndex = 0; wordIndex < words.length; wordIndex++) {
    const candidateLine = currentLine === '' ? words[wordIndex] : currentLine + ' ' + words[wordIndex];
    if (textWidth(fontId, candidateLine, 0) <= maxWidth || currentLine === '') {
      currentLine = candidateLine;
      continue;
    }
    if (lineCount === maxLines) break;
    lineCount++;
    currentLine = words[wordIndex];
  }
  return lineCount;
}

/** Draws a Lucide icon by name (zinc.json lists every name used). zinc:svg follows `setTransform`. */
export function drawGlyph(iconName: string, x: number, y: number, size: number, color: u32, alpha: i32 = 255, strokeWidth: number = 2): void {
  const svgIcon = icon(iconName, color as i32, strokeWidth);
  if (svgIcon !== null) svgIcon.draw(x, y, size, size, alpha);
}

/** The ring around the control the keyboard focus is on. */
export function drawFocusRing(x: number, y: number, width: number, height: number, cornerRadius: number): void {
  border(x - 3, y - 3, width + 6, height + 6, cornerRadius + 3, 2, COLOR_FOCUS_RING, 255);
}
