// ============================================================================
// pages/home/clock-slide.ts — Slide 1: StandBy clock with 5 faces
// ============================================================================
// The user swipes vertically to choose one of the 5 faces:
// 0 = Analog, 1 = Giant digital, 2 = Activity rings,
// 3 = Interactive lava lamp, 4 = Rolling-flap odometer.
// Each face is itself a child `DisplayObject` positioned vertically!

import { rrect, fontAscent, setTransform } from 'zinc:gfx';
import { Group } from 'zinc:sonos';
import gsap, { Timeline } from 'gsap';
import {
  CLOCK_FACE_ANALOG,
  CLOCK_FACE_COUNT,
  CLOCK_FACE_DIGITAL,
  CLOCK_FACE_LAVA,
  CLOCK_FACE_ODOMETER,
  CLOCK_FACE_RINGS,
  COLOR_ACCENT,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  MONTHS_LONG,
  RING_COLORS,
  SLIDE_PLAYER,
  WEEKDAYS_LONG,
} from '../../constants';
import { FONT_CLOCK_HUGE, Fonts } from '../../fonts';
import { DisplayObject } from '../../core/display';
import { registerTapZone, isZonePressed, uiState } from '../../core/input';
import {
  drawCenteredText,
  drawLabel,
  drawTabularText,
  drawTransportIcon,
  measureTabularWidth,
} from '../../components/primitives';
import { drawCoverArt } from '../../components/cover';
import {
  drawAnalogWatchFace,
  drawLavaLampBackground,
  drawOdometerDigits,
  drawRingArc,
  getLavaLampPaletteIndex,
  LAVA_PALETTE_NAMES,
  setLavaLampPaletteIndex,
} from './clock-faces';
import {
  appState,
  executeGroupCommand,
  getGroupArtworkUrl,
  lavaHintGsapTarget,
  lavaHintTimeline,
  saveCarouselAndClockPreferences,
  setLavaHintTimeline,
  togglePlayPause,
} from '../../state';

/** Draws the day of the week and the full date on two lines. */
function drawDateBlock(x: number, y: number, maxWidth: number): void {
  const nowDate = new Date();
  const weekdayName = WEEKDAYS_LONG[nowDate.getDay()];
  const capitalizedWeekday = weekdayName.charAt(0).toUpperCase() + weekdayName.slice(1);
  drawLabel(Fonts.hero, x, y, capitalizedWeekday, COLOR_ACCENT, maxWidth);
  drawLabel(
    Fonts.title,
    x,
    y + 46,
    `${nowDate.getDate()} ${MONTHS_LONG[nowDate.getMonth()]}`,
    COLOR_TEXT_SECONDARY,
    maxWidth
  );
}

/**
 * What plays, as a card on the clock faces: a tap opens the player; previous, play or pause and next on the right,
 * or on a second row when the card is narrow (the column beside the analog and rings faces).
 */
function drawCompactNowPlayingCard(x: number, y: number, width: number): void {
  if (appState.activeGroup === null) return;
  const group = appState.activeGroup as Group;
  const track = group.track;
  if (track.title === '' && track.station === '') return;

  const isNarrow = width < 440;
  const cardHeight = isNarrow ? 156 : 92;
  const textWidth = isNarrow ? width - 106 : width - 290;
  rrect(x, y, width, cardHeight, 18, 0xffffff, isZonePressed('clock/now') ? 40 : 22);
  drawCoverArt(
    getGroupArtworkUrl(group),
    track.title !== '' ? track.title : track.station,
    x + 14,
    y + 14,
    64,
    10,
    track.source === 'radio' && track.art === ''
  );
  drawLabel(
    Fonts.smallBold,
    x + 92,
    y + 22,
    track.title !== '' ? track.title : track.station,
    COLOR_TEXT_PRIMARY,
    textWidth
  );
  drawLabel(
    Fonts.small,
    x + 92,
    y + 48,
    track.artist !== '' ? track.artist : group.name(),
    COLOR_TEXT_SECONDARY,
    textWidth
  );
  registerTapZone('clock/now', x, y, isNarrow ? width : width - 190, isNarrow ? 92 : cardHeight, () => {
    appState.targetSlideIndex = SLIDE_PLAYER;
    saveCarouselAndClockPreferences();
  });

  const playButtonX = isNarrow ? x + width / 2 : x + width - 98;
  const playButtonY = isNarrow ? y + 118 : y + 46;
  drawTransportIcon(
    'prev',
    playButtonX - 60,
    playButtonY,
    20,
    isZonePressed('clock/prev') ? COLOR_TEXT_SECONDARY : COLOR_TEXT_PRIMARY
  );
  registerTapZone('clock/prev', playButtonX - 88, playButtonY - 30, 56, 60, () =>
    executeGroupCommand('Précédent', (system, targetGroup) => system.previous(targetGroup))
  );
  rrect(
    playButtonX - 24,
    playButtonY - 24,
    48,
    48,
    24,
    isZonePressed('clock/play') ? 0xd1d1d6 : 0xffffff,
    255
  );
  drawTransportIcon(
    group.playing() ? 'pause' : 'play',
    group.playing() ? playButtonX : playButtonX + 2,
    playButtonY,
    18,
    0x000000
  );
  registerTapZone('clock/play', playButtonX - 30, playButtonY - 30, 60, 60, togglePlayPause);
  drawTransportIcon(
    'next',
    playButtonX + 60,
    playButtonY,
    20,
    isZonePressed('clock/next') ? COLOR_TEXT_SECONDARY : COLOR_TEXT_PRIMARY
  );
  registerTapZone('clock/next', playButtonX + 32, playButtonY - 30, 56, 60, () =>
    executeGroupCommand('Suivant', (system, targetGroup) => system.next(targetGroup))
  );
}

/**
 * Child node representing one of the 5 faces of the StandBy clock.
 */
class SingleClockFaceNode extends DisplayObject {
  faceKind: i32;
  private lastSeenLavaTimestamp: number = -10;

  constructor(faceKind: i32) {
    super(`ClockFace_${faceKind}`);
    this.faceKind = faceKind;
  }

  override onDraw(viewWidth: number, viewHeight: number): void {
    if (this.faceKind === CLOCK_FACE_ANALOG) {
      this.drawAnalog(viewWidth, viewHeight);
    } else if (this.faceKind === CLOCK_FACE_DIGITAL) {
      this.drawDigital(viewWidth, viewHeight);
    } else if (this.faceKind === CLOCK_FACE_RINGS) {
      this.drawRings(viewWidth, viewHeight);
    } else if (this.faceKind === CLOCK_FACE_LAVA) {
      this.drawLava(viewWidth, viewHeight);
    } else if (this.faceKind === CLOCK_FACE_ODOMETER) {
      this.drawOdometer(viewWidth, viewHeight);
    }
  }

  private drawAnalog(viewWidth: number, viewHeight: number): void {
    const nowDate = new Date();
    const watchRadius = Math.min(250, viewHeight * 0.34);
    const watchCenterX = 72 + watchRadius;
    const watchCenterY = viewHeight / 2;

    drawAnalogWatchFace(
      watchCenterX,
      watchCenterY,
      watchRadius,
      nowDate.getHours(),
      nowDate.getMinutes(),
      nowDate.getSeconds()
    );

    const rightColumnX = watchCenterX + watchRadius + 72;
    const rightColumnWidth = viewWidth - rightColumnX - 56;
    drawDateBlock(rightColumnX, watchCenterY - 120, rightColumnWidth);
    drawCompactNowPlayingCard(rightColumnX, watchCenterY + 40, rightColumnWidth);
  }

  private drawDigital(viewWidth: number, viewHeight: number): void {
    const nowDate = new Date();
    const minutes = nowDate.getMinutes();
    const timeString = `${nowDate.getHours()}:${minutes < 10 ? '0' : ''}${minutes}`;
    const fullDateLine = `${WEEKDAYS_LONG[nowDate.getDay()]} ${nowDate.getDate()} ${
      MONTHS_LONG[nowDate.getMonth()]
    }`.toUpperCase();

    drawCenteredText(Fonts.smallBold, viewWidth / 2, viewHeight * 0.16, fullDateLine, COLOR_ACCENT);
    drawTabularText(
      FONT_CLOCK_HUGE,
      (viewWidth - measureTabularWidth(FONT_CLOCK_HUGE, timeString)) / 2,
      viewHeight * 0.2,
      timeString,
      COLOR_TEXT_PRIMARY
    );
    drawCompactNowPlayingCard((viewWidth - 480) / 2, viewHeight - 150, 480);
  }

  private drawRings(viewWidth: number, viewHeight: number): void {
    const nowDate = new Date();
    const hours = nowDate.getHours();
    const minutes = nowDate.getMinutes();
    const seconds = nowDate.getSeconds();

    const outerRadius = Math.min(250, viewHeight * 0.34);
    const centerX = 72 + outerRadius;
    const centerY = viewHeight / 2;
    const ringThickness = 46;
    const ringGap = 8;

    const ringFractions = [
      ((hours % 12) + minutes / 60) / 12,
      (minutes + seconds / 60) / 60,
      seconds / 60,
    ];

    for (let ringIndex = 0; ringIndex < 3; ringIndex++) {
      const radius = outerRadius - ringThickness / 2 - ringIndex * (ringThickness + ringGap);
      drawRingArc(centerX, centerY, radius, ringThickness, 1, RING_COLORS[ringIndex], 60);
      drawRingArc(
        centerX,
        centerY,
        radius,
        ringThickness,
        Math.max(0.01, ringFractions[ringIndex]),
        RING_COLORS[ringIndex],
        255
      );
    }

    const timeString = `${hours}:${minutes < 10 ? '0' : ''}${minutes}`;
    drawCenteredText(
      Fonts.hero,
      centerX,
      centerY - fontAscent(Fonts.hero) / 2 - 2,
      timeString,
      COLOR_TEXT_PRIMARY
    );

    const rightColumnX = centerX + outerRadius + 72;
    const rightColumnWidth = viewWidth - rightColumnX - 56;
    drawDateBlock(rightColumnX, centerY - 120, rightColumnWidth);
    drawCompactNowPlayingCard(rightColumnX, centerY + 40, rightColumnWidth);
  }

  private drawLava(viewWidth: number, viewHeight: number): void {
    const nowDate = new Date();
    const minutes = nowDate.getMinutes();
    const timeString = `${nowDate.getHours()}:${minutes < 10 ? '0' : ''}${minutes}`;

    drawLavaLampBackground(viewWidth, viewHeight);
    registerTapZone('lava/colour', 0, 0, viewWidth, viewHeight, () => {
      setLavaLampPaletteIndex(getLavaLampPaletteIndex() + 1);
      saveCarouselAndClockPreferences();
      uiState.dirty = true;
    });

    const fullDateLine = `${WEEKDAYS_LONG[nowDate.getDay()]} ${nowDate.getDate()} ${
      MONTHS_LONG[nowDate.getMonth()]
    }`.toUpperCase();
    drawCenteredText(Fonts.smallBold, viewWidth / 2, viewHeight * 0.16, fullDateLine, COLOR_TEXT_PRIMARY, 200);
    drawTabularText(
      FONT_CLOCK_HUGE,
      (viewWidth - measureTabularWidth(FONT_CLOCK_HUGE, timeString)) / 2,
      viewHeight * 0.2,
      timeString,
      COLOR_TEXT_PRIMARY
    );
    drawCompactNowPlayingCard((viewWidth - 480) / 2, viewHeight - 150, 480);

    if (appState.elapsedAppClockSeconds - this.lastSeenLavaTimestamp > 0.5) {
      if (lavaHintTimeline !== null) {
        (lavaHintTimeline as Timeline).kill();
      }
      lavaHintGsapTarget.a = 0;
      lavaHintGsapTarget.r = 14;
      const timeline = gsap.timeline();
      timeline
        .to(lavaHintGsapTarget, { a: 1, r: 0, duration: 0.6, ease: 'power2.out' })
        .to(lavaHintGsapTarget, { a: 0, duration: 0.6, ease: 'power1.in' }, '+=9');
      setLavaHintTimeline(timeline);
    }
    this.lastSeenLavaTimestamp = appState.elapsedAppClockSeconds;

    if (lavaHintGsapTarget.a > 0.01) {
      const paletteName = LAVA_PALETTE_NAMES[getLavaLampPaletteIndex()];
      drawCenteredText(
        Fonts.small,
        viewWidth / 2,
        viewHeight - 44 + lavaHintGsapTarget.r,
        `${paletteName} · touche le verre pour changer de couleur`,
        COLOR_TEXT_PRIMARY,
        Math.round(190 * lavaHintGsapTarget.a) as i32
      );
    }
  }

  private drawOdometer(viewWidth: number, viewHeight: number): void {
    const nowDate = new Date();
    const fullDateLine = `${WEEKDAYS_LONG[nowDate.getDay()]} ${nowDate.getDate()} ${
      MONTHS_LONG[nowDate.getMonth()]
    }`.toUpperCase();
    drawCenteredText(Fonts.smallBold, viewWidth / 2, viewHeight * 0.12, fullDateLine, COLOR_ACCENT);
    drawOdometerDigits(viewWidth / 2, viewHeight * 0.42, nowDate.getHours(), nowDate.getMinutes());
    drawCompactNowPlayingCard((viewWidth - 480) / 2, viewHeight - 150, 480);
  }
}

/**
 * Container node of the StandBy clock: holds the 5 child faces and
 * the vertical pagination indicators on the right edge.
 */
export class ClockSlideNode extends DisplayObject {
  private faceNodes: SingleClockFaceNode[] = [];

  constructor() {
    super('ClockSlide');
    for (let faceIndex: i32 = 0; faceIndex < CLOCK_FACE_COUNT; faceIndex++) {
      const faceNode = new SingleClockFaceNode(faceIndex);
      this.faceNodes.push(faceNode);
      this.addChild(faceNode);
    }
  }

  override onDraw(viewWidth: number, viewHeight: number): void {
    // Positions each child face according to the vertical scroll `animatedClockFaceY`
    for (let faceIndex: i32 = 0; faceIndex < CLOCK_FACE_COUNT; faceIndex++) {
      const verticalOffset = Math.round((faceIndex - appState.animatedClockFaceY) * viewHeight);
      const faceNode = this.faceNodes[faceIndex];
      faceNode.x = 0;
      faceNode.y = verticalOffset;
      faceNode.width = viewWidth;
      faceNode.height = viewHeight;
      faceNode.visible = Math.abs(verticalOffset) < viewHeight;
    }
  }

  /**
   * After the child faces are drawn, draws the vertical marker dots on the right.
   */
  override renderTree(
    stageWidth: number,
    stageHeight: number,
    parentWorldX: number,
    parentWorldY: number
  ): void {
    super.renderTree(stageWidth, stageHeight, parentWorldX, parentWorldY);
    if (!this.visible) return;

    // Back to this slide's own frame: the last face drawn left its transform (it slides during a swipe)
    const slideWorldX = parentWorldX + this.x;
    const slideWorldY = parentWorldY + this.y;
    setTransform(1, 0, 0, 1, slideWorldX, slideWorldY);
    uiState.offsetX = slideWorldX;
    uiState.offsetY = slideWorldY;
    const viewWidth = this.width > 0 ? this.width : stageWidth;
    const viewHeight = this.height > 0 ? this.height : stageHeight;
    for (let faceIndex: i32 = 0; faceIndex < CLOCK_FACE_COUNT; faceIndex++) {
      const proximity = Math.max(0, 1 - Math.abs(appState.animatedClockFaceY - faceIndex));
      const dotY = viewHeight / 2 + (faceIndex - (CLOCK_FACE_COUNT - 1) / 2) * 18 - 4;
      rrect(
        viewWidth - 24,
        dotY,
        8,
        8,
        4,
        COLOR_TEXT_PRIMARY,
        Math.round(70 + 185 * proximity) as i32
      );
    }
  }
}
