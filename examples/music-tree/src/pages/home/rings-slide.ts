// ============================================================================
// pages/home/rings-slide.ts — Slide 3 : Anneaux de volume de toutes les pièces
// ============================================================================
// Représente le volume de chaque enceinte Sonos sous forme d'anneau concentrique
// inspiré des anneaux d'activité de l'Apple Watch, avec son curseur à droite.

import { rrect, drawText, textWidth } from 'zinc:gfx';
import { System, Speaker } from 'zinc:sonos';
import {
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  COLOR_TEXT_TERTIARY,
  RING_COLORS,
} from '../../constants';
import { Fonts } from '../../fonts';
import { DisplayObject } from '../../core/display';
import { drawCenteredText, drawLabel } from '../../components/primitives';
import { drawSlider } from '../../components/slider';
import { drawRingArc } from './clock-faces';
import { appState, setSpeakerRoomVolume } from '../../state';

export class VolumesRingsSlideNode extends DisplayObject {
  constructor() {
    super('VolumesRingsSlide');
  }

  override onDraw(viewWidth: number, viewHeight: number): void {
    drawText(Fonts.hero, 64, 18, 'Volumes', COLOR_TEXT_PRIMARY, 255, 0);

    const visibleSpeakers: Speaker[] = [];
    if (appState.sonosSystem !== null) {
      const system = appState.sonosSystem as System;
      for (let groupIndex = 0; groupIndex < system.groups.length; groupIndex++) {
        const group = system.groups[groupIndex];
        for (let memberIndex = 0; memberIndex < group.members.length; memberIndex++) {
          if (visibleSpeakers.length < RING_COLORS.length) {
            visibleSpeakers.push(group.members[memberIndex]);
          }
        }
      }
    }

    const speakerCount = visibleSpeakers.length;
    if (speakerCount === 0) {
      drawCenteredText(
        Fonts.heading,
        viewWidth / 2,
        viewHeight / 2 - 20,
        appState.sonosStatusMessage !== '' ? appState.sonosStatusMessage : 'Aucune enceinte',
        COLOR_TEXT_SECONDARY
      );
      return;
    }

    const outerRadius = Math.min(250, viewHeight * 0.36);
    const centerX = 72 + outerRadius;
    const centerY = viewHeight / 2 + 24;
    const ringGap = 8;
    const ringThickness = Math.min(48, (outerRadius - 56) / speakerCount - ringGap);

    for (let index = 0; index < speakerCount; index++) {
      const speaker = visibleSpeakers[index];
      const radius = outerRadius - ringThickness / 2 - index * (ringThickness + ringGap);
      const ringColor = RING_COLORS[index];

      drawRingArc(centerX, centerY, radius, ringThickness, 1, ringColor, 60);
      if (speaker.volume > 0) {
        drawRingArc(
          centerX,
          centerY,
          radius,
          ringThickness,
          speaker.volume / 100,
          speaker.muted ? COLOR_TEXT_TERTIARY : ringColor,
          255
        );
      }
    }

    const listStartX = centerX + outerRadius + 64;
    const listWidth = viewWidth - listStartX - 56;
    const rowHeight = Math.min(118, (viewHeight - 130) / speakerCount);
    let currentRowY = centerY - (rowHeight * speakerCount) / 2;

    for (let index = 0; index < speakerCount; index++) {
      const speaker = visibleSpeakers[index];
      const ringColor = RING_COLORS[index];
      const volumePercent = speaker.volume;

      rrect(listStartX, currentRowY + 8, 14, 14, 7, ringColor, 255);
      drawLabel(
        Fonts.bodyBold,
        listStartX + 26,
        currentRowY + 2,
        speaker.name + (speaker.muted ? ' (muet)' : ''),
        COLOR_TEXT_PRIMARY,
        listWidth - 110
      );

      const volumeString = volumePercent >= 0 ? '' + volumePercent : '–';
      drawText(
        Fonts.hero,
        listStartX + listWidth - textWidth(Fonts.hero, volumeString, 0),
        currentRowY - 6,
        volumeString,
        ringColor,
        255,
        0
      );

      drawSlider(
        'ring/v/' + speaker.uuid,
        listStartX + 2,
        currentRowY + 58,
        listWidth - 4,
        volumePercent >= 0 ? volumePercent / 100 : 0,
        ringColor,
        (newValue: number, isReleased: boolean) => setSpeakerRoomVolume(speaker, newValue),
        6
      );
      currentRowY += rowHeight;
    }
  }
}
