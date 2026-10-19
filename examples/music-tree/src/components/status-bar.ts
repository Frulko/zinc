// ============================================================================
// components/status-bar.ts — Barre d'état supérieure (heure, date, batterie, pièce)
// ============================================================================
// Affichée tout en haut de l'écran (30 px de haut), elle indique l'heure et la
// date à gauche, les points de position du carrousel au centre, et l'état de la
// batterie ainsi que le groupe d'enceintes actif à droite.

import { rect, rrect, drawText, textWidth, fontAscent } from 'zinc:gfx';
import { device } from 'zinc:sys';
import { Group } from 'zinc:sonos';
import {
  COLOR_BACKGROUND,
  COLOR_DANGER,
  COLOR_GREEN,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  MONTHS_SHORT,
  PAGE_NOW_PLAYING,
  SLIDE_CLOCK,
  SLIDE_COUNT,
  STATUS_BAR_HEIGHT,
  WEEKDAYS_SHORT,
} from '../constants';
import { Fonts } from '../fonts';
import { DisplayObject } from '../core/display';
import { registerTapZone, uiState } from '../core/input';
import {
  drawGlyph,
  drawLabel,
  drawTabularText,
  measureTabularWidth,
} from './primitives';
import { appState } from '../state';

/** Retourne `[heures, minutes, jourSemaine, jourMois, mois]` de l'heure locale. */
export function getCurrentClockParts(): i32[] {
  const nowDate = new Date();
  return [
    nowDate.getHours() as i32,
    nowDate.getMinutes() as i32,
    nowDate.getDay() as i32,
    nowDate.getDate() as i32,
    nowDate.getMonth() as i32,
  ];
}

/**
 * Dessine l'icône de batterie style iOS à l'extrémité droite de la barre d'état.
 * Retourne l'abscisse X de son bord gauche pour que le nom de l'enceinte se place à côté.
 */
function drawBatteryStatusIndicator(rightEdgeX: number, textTopY: number): number {
  if (!appState.config.showBatteryIndicator || appState.batteryLevelPercent < 0) {
    return rightEdgeX;
  }

  const bodyWidth = 26;
  const bodyHeight = 13;
  const bodyX = rightEdgeX - bodyWidth - 3;
  const bodyY = (STATUS_BAR_HEIGHT - bodyHeight) / 2;

  const fillColor = appState.isBatteryCharging
    ? COLOR_GREEN
    : appState.batteryLevelPercent < 20
    ? COLOR_DANGER
    : COLOR_TEXT_PRIMARY;

  rrect(bodyX, bodyY, bodyWidth, bodyHeight, 4, COLOR_TEXT_PRIMARY, 110);
  rrect(bodyX + 1.5, bodyY + 1.5, bodyWidth - 3, bodyHeight - 3, 3, COLOR_BACKGROUND, 255);
  rrect(
    bodyX + 2.5,
    bodyY + 2.5,
    Math.max(2, ((bodyWidth - 5) * appState.batteryLevelPercent) / 100),
    bodyHeight - 5,
    2,
    fillColor,
    255
  );
  rrect(bodyX + bodyWidth + 1, bodyY + 4, 2, bodyHeight - 8, 1, COLOR_TEXT_PRIMARY, 110);

  let nextLeftX = bodyX;
  if (appState.isBatteryCharging) {
    drawGlyph('zap', bodyX - 16, (STATUS_BAR_HEIGHT - 14) / 2, 14, COLOR_GREEN);
    nextLeftX -= 18;
  }
  if (appState.config.showBatteryPercentage) {
    const percentLabel = `${appState.batteryLevelPercent} %`;
    nextLeftX -= measureTabularWidth(Fonts.small, percentLabel) + 6;
    drawTabularText(Fonts.small, nextLeftX, textTopY, percentLabel, COLOR_TEXT_SECONDARY);
  }
  return nextLeftX - 18;
}

/**
 * Nœud de l'arbre d'affichage représentant la barre d'état supérieure.
 * Gère également la lecture périodique du niveau de batterie dans son `onUpdate`.
 */
export class StatusBarNode extends DisplayObject {
  private batteryPollTimerSeconds: number = 99;

  constructor() {
    super('StatusBar');
  }

  override onUpdate(deltaSeconds: number): void {
    if (appState.screenPower.asleep) return;
    this.batteryPollTimerSeconds += deltaSeconds;
    if (this.batteryPollTimerSeconds < 10) return;
    this.batteryPollTimerSeconds = 0;

    let readLevel: i32 = -1;
    let readCharging = false;
    try {
      const rawBatteryJson = device('battery', '');
      if (rawBatteryJson !== '') {
        const parsed = JSON.parse(rawBatteryJson);
        readLevel = Math.round((parsed.level as number) * 100) as i32;
        readCharging = parsed.charging === true;
      }
    } catch (error) {
      /* pas de batterie sur cet appareil */
    }

    if (
      readLevel !== appState.batteryLevelPercent ||
      readCharging !== appState.isBatteryCharging
    ) {
      appState.batteryLevelPercent = readLevel;
      appState.isBatteryCharging = readCharging;
      uiState.dirty = true;
    }
  }

  override onDraw(screenWidth: number, screenHeight: number): void {
    if (appState.currentPage !== PAGE_NOW_PLAYING) {
      rect(0, 0, screenWidth, STATUS_BAR_HEIGHT, COLOR_BACKGROUND);
    } else if (Math.abs(appState.animatedSlideX - SLIDE_CLOCK) < 1) {
      const clockSlideFactor = 1 - Math.abs(appState.animatedSlideX - SLIDE_CLOCK);
      rrect(
        0,
        0,
        screenWidth,
        STATUS_BAR_HEIGHT,
        0,
        COLOR_BACKGROUND,
        Math.round(clockSlideFactor * 255) as i32
      );
    }

    const clockParts = getCurrentClockParts();
    const minutes = clockParts[1];
    const timeText = `${clockParts[0]}:${minutes < 10 ? '0' : ''}${minutes}`;
    const textTopY = Math.round(STATUS_BAR_HEIGHT / 2 - fontAscent(Fonts.smallBold) * 0.625);

    drawTabularText(Fonts.smallBold, 20, textTopY, timeText, COLOR_TEXT_PRIMARY);
    const dateText = `${WEEKDAYS_SHORT[clockParts[2]]} ${clockParts[3]} ${MONTHS_SHORT[clockParts[4]]}`;
    drawText(
      Fonts.small,
      28 + measureTabularWidth(Fonts.smallBold, timeText),
      textTopY,
      dateText,
      COLOR_TEXT_SECONDARY,
      255,
      0
    );

    // Indicateurs de page du carrousel au centre de la barre
    if (appState.currentPage === PAGE_NOW_PLAYING) {
      for (let slideIndex: i32 = 0; slideIndex < SLIDE_COUNT; slideIndex++) {
        const activeProximity = Math.max(0, 1 - Math.abs(appState.animatedSlideX - slideIndex));
        const dotX = screenWidth / 2 + (slideIndex - (SLIDE_COUNT - 1) / 2) * 18 - 4;
        const dotY = STATUS_BAR_HEIGHT / 2 - 4;
        rrect(
          dotX,
          dotY,
          8,
          8,
          4,
          COLOR_TEXT_PRIMARY,
          Math.round(70 + 185 * activeProximity) as i32
        );
      }
    }

    const availableRightX = drawBatteryStatusIndicator(screenWidth - 20, textTopY);
    if (appState.activeGroup === null) return;

    const activeGroup = appState.activeGroup as Group;
    const groupName = activeGroup.name();
    const nameWidth = Math.min(360, textWidth(Fonts.small, groupName, 0));
    const nameX = availableRightX - nameWidth;

    drawLabel(Fonts.small, nameX, textTopY, groupName, COLOR_TEXT_SECONDARY, nameWidth);
    drawGlyph(
      activeGroup.playing() ? 'audio-lines' : 'speaker',
      nameX - 24,
      (STATUS_BAR_HEIGHT - 16) / 2,
      16,
      activeGroup.playing() ? COLOR_GREEN : COLOR_TEXT_SECONDARY
    );
    registerTapZone('status/group', nameX - 32, 0, nameWidth + 52, STATUS_BAR_HEIGHT, () => {
      appState.isContextSheetOpen = true;
      uiState.dirty = true;
    });
  }
}
