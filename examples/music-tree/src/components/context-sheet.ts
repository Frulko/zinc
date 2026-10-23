// ============================================================================
// components/context-sheet.ts — "Que contrôler ?" modal sheet
// ============================================================================
// Lets the user switch from one Sonos speaker group to another or play/pause
// any group with one touch.

import { rrect, drawText } from 'zinc:gfx';
import { System } from 'zinc:sonos';
import {
  COLOR_ACCENT,
  COLOR_CARD,
  COLOR_CARD_ELEVATED,
  COLOR_FILL,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  PAGE_NOW_PLAYING,
  PAGE_ROOMS,
} from '../constants';
import { Fonts } from '../fonts';
import { DisplayObject, ScrollBox, beginScrollBox, endScrollBox, uiState, registerTapZone, isZonePressed } from 'zinc:stage';
import { drawCardShadow, drawLabel, drawTransportIcon } from './primitives';
import { drawIconButton, drawPillButton } from './buttons';
import { drawCoverArt } from './cover';
import {
  appState,
  getGroupArtworkUrl,
  selectActiveSonosGroup,
  navigateToPage,
  runSafeNetworkAction,
  skipGroupTrack,
  sleepMilliseconds,
} from '../state';

export class ContextSheetNode extends DisplayObject {
  private readonly scroll = new ScrollBox();
  constructor() {
    super('ContextSheet');
  }

  override onUpdate(deltaSeconds: number): void {
    if (appState.isContextSheetOpen && this.scroll.stepInertia(deltaSeconds)) uiState.dirty = true;
  }

  override onDraw(stageWidth: number, stageHeight: number): void {
    if (!appState.isContextSheetOpen || appState.sonosSystem === null) return;

    const system = appState.sonosSystem as System;
    registerTapZone('ctx/veil', 0, 0, stageWidth, stageHeight, () => {
      appState.isContextSheetOpen = false;
    });
    rrect(0, 0, stageWidth, stageHeight, 0, 0x000000, 120);

    const sheetWidth = Math.min(600, stageWidth - 24);
    const compact = sheetWidth < 500;
    const rowHeight = compact ? 140 : 92;
    const sheetHeight = Math.min(stageHeight - 24, 150 + system.groups.length * rowHeight);
    const sheetX =
      Math.max(12, Math.min(stageWidth - sheetWidth - 12, appState.sidebarWidth + (stageWidth - appState.sidebarWidth - sheetWidth) / 2));
    const sheetY = Math.max(12, (stageHeight - sheetHeight) / 2);

    drawCardShadow(sheetX, sheetY, sheetWidth, sheetHeight, 20);
    rrect(sheetX, sheetY, sheetWidth, sheetHeight, 20, COLOR_CARD, 255);
    registerTapZone('ctx/card', sheetX, sheetY, sheetWidth, sheetHeight, () => {});

    drawText(Fonts.heading, sheetX + 24, sheetY + 24, 'Que contrôler ?', COLOR_TEXT_PRIMARY, 255, 0);
    drawIconButton(
      'ctx/close',
      'x',
      sheetX + sheetWidth - 36,
      sheetY + 36,
      20,
      COLOR_TEXT_SECONDARY,
      () => {
        appState.isContextSheetOpen = false;
      },
      COLOR_CARD_ELEVATED,
      255
    );

    this.scroll.contentHeight = system.groups.length * rowHeight;
    this.scroll.viewportHeight = Math.max(1, sheetHeight - 150);
    this.scroll.clamp();
    beginScrollBox(this.scroll, sheetX + 12, sheetY + 76, sheetWidth - 24, this.scroll.viewportHeight);
    for (let groupIndex = 0; groupIndex < system.groups.length; groupIndex++) {
      const group = system.groups[groupIndex];
      const capturedGroup = group;
      const rowY = sheetY + 76 + groupIndex * rowHeight - this.scroll.scrollY;
      const isSelectedGroup = group === appState.activeGroup;
      const rowZoneId = 'ctx/g/' + group.id;

      if (isSelectedGroup) {
        rrect(sheetX + 12, rowY, sheetWidth - 24, rowHeight - 8, 14, 0xffffff, 22);
      } else if (isZonePressed(rowZoneId)) {
        rrect(sheetX + 12, rowY, sheetWidth - 24, rowHeight - 8, 14, 0xffffff, 12);
      }

      const coverTitle =
        group.track.title !== '' ? group.track.title : group.track.station;
      drawCoverArt(getGroupArtworkUrl(group), coverTitle, sheetX + 24, rowY + 12, 60, 8);

      drawLabel(
        Fonts.bodyBold,
        sheetX + 100,
        rowY + 14,
        group.name(),
        isSelectedGroup ? COLOR_ACCENT : COLOR_TEXT_PRIMARY,
        compact ? sheetWidth - 124 : sheetWidth - 330
      );

      const trackLine =
        group.track.title !== ''
          ? group.track.title +
            (group.track.artist !== '' ? ' · ' + group.track.artist : '')
          : group.track.station !== ''
          ? group.track.station
          : 'Rien en lecture';
      const statePrefix = group.playing()
        ? ''
        : group.state === 'PAUSED_PLAYBACK'
        ? 'En pause · '
        : '';
      drawLabel(
        Fonts.small,
        sheetX + 100,
        rowY + 44,
        statePrefix + trackLine,
        COLOR_TEXT_SECONDARY,
        compact ? sheetWidth - 124 : sheetWidth - 330
      );

      registerTapZone(rowZoneId, sheetX + 12, rowY, compact ? sheetWidth - 24 : sheetWidth - 230, compact ? 70 : rowHeight - 8, () => {
        selectActiveSonosGroup(capturedGroup);
        appState.isContextSheetOpen = false;
        appState.currentPage = PAGE_NOW_PLAYING;
      });

      const playButtonCenterX = compact ? sheetX + sheetWidth / 2 : sheetX + sheetWidth - 120;
      const playButtonCenterY = rowY + (compact ? 104 : 42);
      const previousZoneId = 'ctx/b/' + group.id;
      const nextZoneId = 'ctx/n/' + group.id;
      drawTransportIcon(
        'prev',
        playButtonCenterX - 60,
        playButtonCenterY,
        20,
        isZonePressed(previousZoneId) ? COLOR_TEXT_SECONDARY : COLOR_TEXT_PRIMARY
      );
      registerTapZone(previousZoneId, playButtonCenterX - 88, playButtonCenterY - 30, 56, 60, () =>
        skipGroupTrack(capturedGroup, -1)
      );
      drawTransportIcon(
        'next',
        playButtonCenterX + 60,
        playButtonCenterY,
        20,
        isZonePressed(nextZoneId) ? COLOR_TEXT_SECONDARY : COLOR_TEXT_PRIMARY
      );
      registerTapZone(nextZoneId, playButtonCenterX + 32, playButtonCenterY - 30, 56, 60, () =>
        skipGroupTrack(capturedGroup, 1)
      );
      const playZoneId = 'ctx/p/' + group.id;
      rrect(
        playButtonCenterX - 26,
        playButtonCenterY - 26,
        52,
        52,
        26,
        isZonePressed(playZoneId) ? 0xd1d1d6 : 0xffffff,
        255
      );
      drawTransportIcon(
        group.playing() ? 'pause' : 'play',
        group.playing() ? playButtonCenterX : playButtonCenterX + 2,
        playButtonCenterY,
        20,
        0x000000
      );
      registerTapZone(
        playZoneId,
        playButtonCenterX - 30,
        playButtonCenterY - 30,
        60,
        60,
        () => {
          runSafeNetworkAction(capturedGroup.name(), async (): Promise<void> => {
            if (capturedGroup.playing()) {
              await system.pause(capturedGroup);
            } else {
              await system.play(capturedGroup);
            }
            await sleepMilliseconds(400);
            await system.update(capturedGroup);
          });
        }
      );
    }

    endScrollBox();

    const bottomButtonY = sheetY + sheetHeight - 62;
    drawPillButton(
      'ctx/group',
      sheetX + 24,
      bottomButtonY,
      compact ? 'Gérer les enceintes' : 'Regrouper ou séparer les enceintes',
      COLOR_TEXT_PRIMARY,
      COLOR_FILL,
      () => {
        appState.isContextSheetOpen = false;
        navigateToPage(PAGE_ROOMS);
      },
      'link'
    );
  }
}
