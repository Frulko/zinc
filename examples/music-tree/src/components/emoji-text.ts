// ============================================================================
// components/emoji-text.ts — Text with emoji pictures inline
// ============================================================================
// The Mac's relay draws each emoji as a PNG (the tablet's fonts have none) and
// puts a U+FFFC placeholder in the text where it goes. These helpers draw such a
// text with the pictures in place: one line cut with an ellipsis, or a paragraph
// wrapped at spaces on a few lines. `images` holds the decoded pictures of the
// notification, `firstImage` the index of the first one this text uses (a
// notification's pictures are numbered across its title, subtitle, body and
// sender, in that order). A picture missing (-1) keeps its room, drawn empty.

import { drawImage, drawText, textWidth, fontAscent } from 'zinc:gfx';

export const EMOJI_PLACEHOLDER = '￼';
const EMOJI_GAP = 3;

/** An emoji of font `fontId`: a little taller than the capitals (they are 3/4 of the ascent). */
export function emojiSize(fontId: i32): number {
  return Math.round(fontAscent(fontId) * 0.92);
}

/** Where an emoji of a line starting at `lineY` goes: centred on the capitals. */
function emojiTop(fontId: i32, lineY: number): number {
  return lineY + fontAscent(fontId) * 0.62 - emojiSize(fontId) / 2;
}

export function countEmojiPlaceholders(text: string): i32 {
  let count: i32 = 0;
  for (let index = 0; index < text.length; index++) {
    if (text.charCodeAt(index) === 0xfffc) count++;
  }
  return count;
}

/** The text with its placeholders taken out (for an initial, a hash, a plain label). */
export function stripEmojiPlaceholders(text: string): string {
  return text.indexOf(EMOJI_PLACEHOLDER) < 0 ? text : text.split(EMOJI_PLACEHOLDER).join('');
}

/** The width `drawInlineEmojiText` takes for `text` without a limit. */
export function measureInlineEmojiText(fontId: i32, text: string): number {
  const count = countEmojiPlaceholders(text);
  if (count === 0) return textWidth(fontId, text, 0);
  return textWidth(fontId, stripEmojiPlaceholders(text), 0) + count * (emojiSize(fontId) + EMOJI_GAP);
}

function drawEmoji(images: i32[], imageIndex: i32, fontId: i32, x: number, lineY: number, alpha: i32): void {
  const image = imageIndex < images.length ? images[imageIndex] : -1;
  if (image < 0) return;
  const size = emojiSize(fontId);
  drawImage(image, x, emojiTop(fontId, lineY), size, size, alpha, size * 0.15);
}

/** Draws the longest start of `text` that leaves room for an ellipsis before `rightX`, then the ellipsis. */
function drawCutText(fontId: i32, x: number, y: number, text: string, rightX: number, color: u32, alpha: i32): void {
  const limitX = rightX - textWidth(fontId, '…', 0);
  let keep: i32 = text.length as i32;
  while (keep > 0 && x + textWidth(fontId, text.slice(0, keep), 0) > limitX) keep--;
  drawText(fontId, x, y, text.slice(0, keep).trimEnd() + '…', color, alpha, 0);
}

/**
 * Draws one line from `x`; past `maxWidth` (0: no limit) what does not fit is cut
 * with an ellipsis, words and emoji alike. Returns the x where it ended.
 */
export function drawInlineEmojiText(
  fontId: i32,
  x: number,
  y: number,
  text: string,
  images: i32[],
  firstImage: i32,
  color: u32,
  alpha: i32 = 255,
  maxWidth: number = 0
): number {
  const ellipsisWidth = textWidth(fontId, '…', 0);
  const endX =
    maxWidth > 0 && measureInlineEmojiText(fontId, text) > maxWidth ? x + maxWidth - ellipsisWidth : 1e9;
  const size = emojiSize(fontId);
  let cursorX = x;
  let imageIndex = firstImage;
  let partStart: i32 = 0;
  while (partStart <= text.length) {
    let partEnd = text.indexOf(EMOJI_PLACEHOLDER, partStart) as i32;
    const isLastPart = partEnd < 0;
    if (isLastPart) partEnd = text.length as i32;
    if (partEnd > partStart) {
      const part = text.slice(partStart, partEnd);
      const partWidth = textWidth(fontId, part, 0);
      if (cursorX + partWidth > endX) {
        drawCutText(fontId, cursorX, y, part, endX + ellipsisWidth, color, alpha);
        return endX + ellipsisWidth;
      }
      drawText(fontId, cursorX, y, part, color, alpha, 0);
      cursorX += partWidth;
    }
    if (isLastPart) break;
    if (cursorX + size > endX) {
      drawText(fontId, cursorX, y, '…', color, alpha, 0);
      return endX + ellipsisWidth;
    }
    drawEmoji(images, imageIndex, fontId, cursorX, y, alpha);
    imageIndex++;
    cursorX += size + EMOJI_GAP;
    partStart = partEnd + 1;
  }
  return cursorX;
}

/**
 * Draws a paragraph wrapped at spaces on at most `maxLines` lines of `lineHeight`;
 * the last line ends with an ellipsis when the rest does not fit. Returns the
 * height taken.
 */
export function drawWrappedEmojiText(
  fontId: i32,
  x: number,
  y: number,
  text: string,
  images: i32[],
  firstImage: i32,
  color: u32,
  maxWidth: number,
  maxLines: i32,
  lineHeight: number,
  alpha: i32 = 255
): number {
  const ellipsisWidth = textWidth(fontId, '…', 0);
  const spaceWidth = textWidth(fontId, ' ', 0);
  const size = emojiSize(fontId);
  let lineIndex: i32 = 0;
  let cursorX = x;
  let imageIndex = firstImage;
  let tokenStart: i32 = 0;
  const length = text.length as i32;
  while (tokenStart < length) {
    // the next token: a space, a placeholder, or a word up to either
    const code = text.charCodeAt(tokenStart);
    let tokenEnd: i32 = tokenStart + 1;
    if (code !== 32 && code !== 0xfffc) {
      while (tokenEnd < length) {
        const next = text.charCodeAt(tokenEnd);
        if (next === 32 || next === 0xfffc) break;
        tokenEnd++;
      }
    }
    const word = code === 32 || code === 0xfffc ? '' : text.slice(tokenStart, tokenEnd);
    const tokenWidth = code === 32 ? spaceWidth : code === 0xfffc ? size + EMOJI_GAP : textWidth(fontId, word, 0);
    tokenStart = tokenEnd;

    if (lineIndex < maxLines - 1 && cursorX > x && cursorX + tokenWidth > x + maxWidth) {
      lineIndex++;
      cursorX = x;
      if (code === 32) continue; // a line never starts with the space it broke at
    }
    const drawY = y + lineIndex * lineHeight;
    if (lineIndex === maxLines - 1 && code !== 32) {
      const hasMore = tokenStart < length;
      if (cursorX + tokenWidth > x + maxWidth - (hasMore ? ellipsisWidth : 0)) {
        drawCutText(fontId, cursorX, drawY, word, x + maxWidth, color, alpha); // the rest does not fit
        return maxLines * lineHeight;
      }
    }
    if (code === 0xfffc) {
      drawEmoji(images, imageIndex, fontId, cursorX, drawY, alpha);
      imageIndex++;
    } else if (code !== 32) {
      drawText(fontId, cursorX, drawY, word, color, alpha, 0);
    }
    cursorX += tokenWidth;
  }
  return length === 0 ? 0 : (lineIndex + 1) * lineHeight;
}
