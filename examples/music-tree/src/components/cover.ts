// ============================================================================
// components/cover.ts — Album covers, radio logos and grid tiles
// ============================================================================

import { rrect, gradient, drawImage, fontAscent } from 'zinc:gfx';
import {
  COLOR_ACCENT,
  COLOR_CARD,
  COLOR_CARD_ELEVATED,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  COLOR_TEXT_TERTIARY,
  COVER_TINT_COLORS,
  GRID_COLUMNS,
  GRID_GAP,
  PAGE_PADDING,
} from '../constants';
import { Fonts } from '../fonts';
import { registerTapZone, isZonePressed } from '../core/input';
import { getPicture, getPictureFadeAlpha, drawPictureContained, isPictureOnItsWay } from '../core/pictures';
import { drawCenteredText, drawGlyph, drawLabel } from './primitives';
import { drawActivitySpinner } from './slider';

/**
 * Draws a square cover of side `size` at `(x, y)`:
 * - If the network picture is ready, it appears with a soft fade (`getPictureFadeAlpha`).
 * - If `isStationLogo` is `true`, the logo is centred on a light square with an inner margin.
 * - While it loads: a quiet tile (and a spinner on a large cover).
 * - When there is no picture at all (no URL, or one that cannot be read): a tile with a gradient picked from the title and its
 *   initials (a note when the title is empty).
 */
export function drawCoverArt(
  imageUrl: string,
  title: string,
  x: number,
  y: number,
  size: number,
  cornerRadius: number,
  isStationLogo: boolean = false
): void {
  const imageId = getPicture(imageUrl);
  // On its way: a quiet tile (a spinner on a large cover), so a cover never shows the made-up tile and then switches to the real one
  if (imageId < 0 && isPictureOnItsWay(imageUrl)) {
    rrect(x, y, size, size, cornerRadius, isStationLogo ? 0xf2f2f7 : COLOR_CARD_ELEVATED, isStationLogo ? 40 : 255);
    if (size >= 120) drawActivitySpinner(x + size / 2, y + size / 2, Math.min(18, size * 0.06));
    return;
  }
  const fadeAlpha = imageId >= 0 ? getPictureFadeAlpha(imageUrl) : 0;

  if (imageId >= 0 && fadeAlpha === 255 && !isStationLogo) {
    drawImage(imageId, x, y, size, size, 255, cornerRadius);
    return;
  }
  if (imageId >= 0 && isStationLogo) {
    rrect(x, y, size, size, cornerRadius, 0xf2f2f7, fadeAlpha);
    drawPictureContained(imageId, x + size * 0.14, y + size * 0.14, size * 0.72, size * 0.72, 4);
    return;
  }
  if (imageId >= 0) {
    rrect(x, y, size, size, cornerRadius, COLOR_CARD_ELEVATED, 255);
    drawImage(imageId, x, y, size, size, fadeAlpha, cornerRadius);
    return;
  }

  if (title === '') {
    rrect(x, y, size, size, cornerRadius, COLOR_CARD_ELEVATED, 255);
    drawGlyph('music', x + size * 0.3, y + size * 0.3, size * 0.4, COLOR_TEXT_TERTIARY);
    return;
  }

  // Deterministic choice of a hue from the title
  let nameHash: i32 = 0;
  for (let charIndex = 0; charIndex < title.length; charIndex++) {
    nameHash = (nameHash * 31 + title.charCodeAt(charIndex)) & 0xffff;
  }
  const topColor = COVER_TINT_COLORS[nameHash % COVER_TINT_COLORS.length];
  const bottomColor = ((topColor >> 1) & 0x7f7f7f) + 0x101010;
  gradient(x, y, size, size, cornerRadius, topColor, bottomColor, true, 255);

  const nonEmptyWords = title.split(' ').filter((word: string) => word.length > 0);
  const initials = (
    nonEmptyWords.length > 1
      ? nonEmptyWords[0].charAt(0) + nonEmptyWords[1].charAt(0)
      : title.slice(0, 2)
  ).toUpperCase();

  const initialsFont = size >= 120 ? Fonts.hero : Fonts.bodyBold;
  drawCenteredText(
    initialsFont,
    x + size / 2,
    y + size / 2 - fontAscent(initialsFont) / 2 - 2,
    initials,
    0xffffff
  );
}

/**
 * Draws a clickable tile in a grid (used for radios and Spotify playlists/albums).
 */
export function drawMediaTile(
  zoneId: string,
  x: number,
  y: number,
  tileSize: number,
  artworkUrl: string,
  title: string,
  subtitle: string,
  isStationLogo: boolean,
  isCurrentlyPlaying: boolean,
  onTap: () => void
): void {
  if (isZonePressed(zoneId)) {
    rrect(x - 6, y - 6, tileSize + 12, tileSize + 12, 18, 0xffffff, 30);
  }
  drawCoverArt(artworkUrl, title, x, y, tileSize, 14, isStationLogo);

  if (isCurrentlyPlaying) {
    rrect(x + tileSize - 44, y + tileSize - 44, 34, 34, 17, COLOR_ACCENT, 255);
    drawGlyph('audio-lines', x + tileSize - 37, y + tileSize - 37, 20, COLOR_TEXT_PRIMARY);
  }

  drawLabel(Fonts.smallBold, x, y + tileSize + 10, title, COLOR_TEXT_PRIMARY, tileSize);
  if (subtitle !== '') {
    drawLabel(Fonts.tiny, x, y + tileSize + 32, subtitle, COLOR_TEXT_SECONDARY, tileSize);
  }
  registerTapZone(zoneId, x, y, tileSize, tileSize + 50, onTap);
}

/**
 * Draws grey placeholder shapes (skeleton) and a spinner during the initial load of a list.
 */
export function drawLoadingSkeleton(
  isGridView: boolean,
  topY: number,
  bottomY: number,
  screenWidth: number,
  sidebarWidth: number
): void {
  const contentStartX = sidebarWidth + PAGE_PADDING;
  const contentWidth = screenWidth - sidebarWidth - PAGE_PADDING * 2;

  if (isGridView) {
    const tileSize = (contentWidth - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
    for (let itemIndex = 0; itemIndex < GRID_COLUMNS * 2; itemIndex++) {
      const columnIndex = itemIndex % GRID_COLUMNS;
      const rowIndex = Math.floor(itemIndex / GRID_COLUMNS);
      const tileX = contentStartX + columnIndex * (tileSize + GRID_GAP);
      const tileY = topY + 8 + rowIndex * (tileSize + 62);
      if (tileY > bottomY) break;

      rrect(tileX, tileY, tileSize, tileSize, 14, COLOR_CARD, 255);
      rrect(tileX, tileY + tileSize + 12, tileSize * 0.7, 14, 7, COLOR_CARD, 255);
      rrect(tileX, tileY + tileSize + 34, tileSize * 0.4, 10, 5, COLOR_CARD, 255);
    }
  } else {
    for (let rowIndex = 0; rowIndex < 8; rowIndex++) {
      const rowY = topY + rowIndex * 68;
      if (rowY + 68 > bottomY) break;

      rrect(contentStartX, rowY + 10, 48, 48, 6, COLOR_CARD, 255);
      rrect(contentStartX + 64, rowY + 16, 260 - (rowIndex % 3) * 40, 14, 7, COLOR_CARD, 255);
      rrect(contentStartX + 64, rowY + 40, 160, 10, 5, COLOR_CARD, 255);
    }
  }

  drawActivitySpinner(sidebarWidth + (screenWidth - sidebarWidth) / 2, topY + 120, 18);
}
