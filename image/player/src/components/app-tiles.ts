// ============================================================================
// components/app-tiles.ts — An app as a tile: its icon, its name, a DEV band, its delete button
// ============================================================================
// The home page draws the last apps sent in a row of tiles, the launcher page all of them in a grid. A tap starts the
// app; while the apps are edited each tile carries a red button that asks before deleting it.

import { drawImage, lineHeight, rrect, textWidth } from 'zinc:gfx';
import { COLOR_DANGER, COLOR_WHITE } from '../constants';
import { Fonts } from '../fonts';
import { isZoneFocused, isZonePressed, registerTapZone } from '../core/input';
import { InstalledApp, appIconImage } from '../services/apps';
import { appState, askDeleteApp, startInstalledApp } from '../state';
import { drawFocusRing, drawGlyph, drawLabel, fitTextToWidth } from './primitives';

/** The icon's square; a tile is as wide as its slot and this plus its name high. */
export const APP_ICON_SIZE = 72;
const ICON_RADIUS = 18;
const NAME_GAP = 6;
export const APP_TILE_HEIGHT = APP_ICON_SIZE + NAME_GAP + 18;
const BAND_COLOR: u32 = 0xffc53d;
const BAND_TEXT_COLOR: u32 = 0x1c1e27;
const DELETE_BUTTON_SIZE = 26;

function drawTileName(x: number, y: number, slotWidth: number, text: string): void {
  const shown = fitTextToWidth(Fonts.small, text, slotWidth);
  drawLabel(Fonts.small, x + (slotWidth - textWidth(Fonts.small, shown, 0)) / 2, y + APP_ICON_SIZE + NAME_GAP, shown, COLOR_WHITE);
}

/** The square of a tile: translucent white, lighter while pressed, its focus ring. */
function drawIconSquare(zoneId: string, iconX: number, iconY: number): void {
  rrect(iconX, iconY, APP_ICON_SIZE, APP_ICON_SIZE, ICON_RADIUS, COLOR_WHITE, isZonePressed(zoneId) ? 90 : 48);
  if (isZoneFocused(zoneId)) drawFocusRing(iconX, iconY, APP_ICON_SIZE, APP_ICON_SIZE, ICON_RADIUS);
}

/** Draws `app` in the slot at (`x`, `y`), `slotWidth` wide. */
export function drawAppTile(app: InstalledApp, x: number, y: number, slotWidth: number): void {
  const zoneId = 'app/' + app.name;
  const iconX = x + (slotWidth - APP_ICON_SIZE) / 2;
  drawIconSquare(zoneId, iconX, y);
  const image = appIconImage(app);
  if (image >= 0) drawImage(image, iconX, y, APP_ICON_SIZE, APP_ICON_SIZE, isZonePressed(zoneId) ? 200 : 255, ICON_RADIUS);
  else drawGlyph('app-window', iconX + (APP_ICON_SIZE - 36) / 2, y + (APP_ICON_SIZE - 36) / 2, 36, COLOR_WHITE);
  if (app.isDev) {
    // the band across the bottom of the icon: an app zinc dev sent, kept after its session
    const bandHeight = 18;
    rrect(iconX + 10, y + APP_ICON_SIZE - bandHeight / 2 - 4, APP_ICON_SIZE - 20, bandHeight, bandHeight / 2, BAND_COLOR, 255);
    const label = 'DEV';
    drawLabel(Fonts.badge, iconX + (APP_ICON_SIZE - textWidth(Fonts.badge, label, 1)) / 2,
      y + APP_ICON_SIZE - 4 - lineHeight(Fonts.badge) / 2, label, BAND_TEXT_COLOR);
  }
  drawTileName(x, y, slotWidth, app.title);
  const isEditing = appState.isEditingApps;
  registerTapZone(zoneId, iconX, y, APP_ICON_SIZE, APP_ICON_SIZE + NAME_GAP + 18,
    isEditing ? () => askDeleteApp(app) : () => startInstalledApp(app));
  if (isEditing) {
    const deleteId = 'app/delete/' + app.name;
    const centerX = iconX + 4;
    const centerY = y + 4;
    const radius = DELETE_BUTTON_SIZE / 2;
    rrect(centerX - radius - 2, centerY - radius - 2, DELETE_BUTTON_SIZE + 4, DELETE_BUTTON_SIZE + 4, radius + 2, COLOR_WHITE, 255);
    rrect(centerX - radius, centerY - radius, DELETE_BUTTON_SIZE, DELETE_BUTTON_SIZE, radius, COLOR_DANGER, isZonePressed(deleteId) ? 200 : 255);
    if (isZoneFocused(deleteId)) drawFocusRing(centerX - radius, centerY - radius, DELETE_BUTTON_SIZE, DELETE_BUTTON_SIZE, radius);
    drawGlyph('x', centerX - 8, centerY - 8, 16, COLOR_WHITE, 255, 3);
    // a finger's size around the small button
    registerTapZone(deleteId, centerX - 22, centerY - 22, 44, 44, () => askDeleteApp(app));
  }
}

/** The + tile that opens the page with all the apps. */
export function drawMoreTile(x: number, y: number, slotWidth: number, onTap: () => void): void {
  const zoneId = 'app/more';
  const iconX = x + (slotWidth - APP_ICON_SIZE) / 2;
  drawIconSquare(zoneId, iconX, y);
  drawGlyph('plus', iconX + (APP_ICON_SIZE - 36) / 2, y + (APP_ICON_SIZE - 36) / 2, 36, COLOR_WHITE, 255, 2.5);
  drawTileName(x, y, slotWidth, 'All apps');
  registerTapZone(zoneId, iconX, y, APP_ICON_SIZE, APP_TILE_HEIGHT, onTap);
}
