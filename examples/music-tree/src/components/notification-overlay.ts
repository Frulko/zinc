// ============================================================================
// components/notification-overlay.ts — Superposition de notifications macOS
// ============================================================================
// Dessine au-dessus de toute l'application (y compris la barre d'état) :
// 1. Soit l'animation plein écran inspirée d'iOS StandBy (sur l'écran d'horloge
//    ou lorsque l'écran était en veille).
// 2. Soit les cartes de bannières grises empilées en haut de l'écran.

import { rrect, textWidth, fontAscent } from 'zinc:gfx';
import {
  COLOR_CARD_ELEVATED,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  STATUS_BAR_HEIGHT,
} from '../constants';
import {
  FONT_STANDBY_EXCERPT,
  FONT_STANDBY_META,
  FONT_STANDBY_NAME,
  FONT_STANDBY_SENDER,
  Fonts,
} from '../fonts';
import { DisplayObject } from '../core/display';
import { registerTapZone } from '../core/input';
import {
  drawCardShadow,
  drawCenteredText,
  drawLabel,
  drawWrappedText,
} from './primitives';
import {
  StandByOverlayAnimation,
  currentStandByOverlay,
  overlayDimState,
  onStandByOverlayTapped,
  drawNotificationAvatarOrIcon,
  drawNotificationAppIcon,
  getNotificationSenderLabel,
  getNotificationExcerpt,
  formatRelativeTimeAgo,
  formatNotificationAppHeader,
  formatBannerTimeLabel,
  activeBanners,
  bannerVeilState,
  dismissBannerItem,
  openNotificationOnMac,
} from '../services/notify-service';

function toByteAlpha(normalizedOpacity: number): i32 {
  return Math.round(255 * Math.max(0, Math.min(1, normalizedOpacity))) as i32;
}

function interpolateLinear(start: number, end: number, factor: number): number {
  return start + (end - start) * factor;
}

/**
 * Dessine la superposition de notifications aux coordonnées écran `(0, 0, screenWidth, screenHeight)`.
 */
export function drawNotificationOverlayLayer(
  screenWidth: number,
  screenHeight: number,
  statusBarHeight: number
): void {
  if (currentStandByOverlay === null) {
    drawTopBannerStack(screenWidth, screenHeight, statusBarHeight);
    return;
  }

  const anim = currentStandByOverlay as StandByOverlayAnimation;
  const notification = anim.notification;
  const visibilityFactor = 1 - anim.fadeOutProgress;

  rrect(0, 0, screenWidth, screenHeight, 0, 0x000000, toByteAlpha(0.86 * overlayDimState.dim));
  registerTapZone('overlay', 0, 0, screenWidth, screenHeight, onStandByOverlayTapped);

  const avatarOpacity = Math.min(1, anim.phase1Grow * 1.6) * visibilityFactor;
  const centeredLabelsOpacity =
    anim.phase1Grow * Math.max(0, 1 - anim.phase2SlideLeft * 2) * visibilityFactor;

  const initialDiameter = 210;
  const compactDiameter = 128;
  const targetLeftCenterX = 90 + compactDiameter / 2;

  const currentDiameter = interpolateLinear(
    initialDiameter * (0.5 + 0.5 * anim.phase1Grow),
    compactDiameter,
    anim.phase2SlideLeft
  );
  const currentCenterX = interpolateLinear(
    screenWidth / 2,
    targetLeftCenterX,
    anim.phase2SlideLeft
  );
  const currentCenterY = interpolateLinear(
    screenHeight / 2 - 60,
    screenHeight / 2,
    anim.phase2SlideLeft
  );

  drawNotificationAvatarOrIcon(
    notification,
    currentCenterX,
    currentCenterY,
    currentDiameter,
    toByteAlpha(avatarOpacity),
    0x000000
  );

  if (centeredLabelsOpacity > 0.01) {
    drawCenteredText(
      FONT_STANDBY_NAME,
      currentCenterX,
      currentCenterY + currentDiameter / 2 + 28,
      getNotificationSenderLabel(notification),
      COLOR_TEXT_PRIMARY,
      toByteAlpha(centeredLabelsOpacity)
    );
    drawCenteredText(
      FONT_STANDBY_META,
      currentCenterX,
      currentCenterY + currentDiameter / 2 + 74,
      notification.appName,
      COLOR_TEXT_SECONDARY,
      toByteAlpha(centeredLabelsOpacity)
    );
  }

  const textColumnX = targetLeftCenterX + compactDiameter / 2 + 44;
  const textColumnWidth = screenWidth - textColumnX - 90;
  const textBaseY = screenHeight / 2 - 92;

  if (anim.line1Progress > 0) {
    drawLabel(
      FONT_STANDBY_META,
      textColumnX,
      textBaseY + (1 - anim.line1Progress) * 18,
      formatRelativeTimeAgo(notification.timestampSeconds),
      COLOR_TEXT_SECONDARY,
      textColumnWidth,
      toByteAlpha(anim.line1Progress * visibilityFactor)
    );
  }
  if (anim.line2Progress > 0) {
    drawLabel(
      FONT_STANDBY_SENDER,
      textColumnX,
      textBaseY + 34 + (1 - anim.line2Progress) * 18,
      getNotificationSenderLabel(notification),
      COLOR_TEXT_PRIMARY,
      textColumnWidth,
      toByteAlpha(anim.line2Progress * visibilityFactor)
    );
  }
  if (anim.line3Progress > 0) {
    drawWrappedText(
      FONT_STANDBY_EXCERPT,
      textColumnX,
      textBaseY + 108 + (1 - anim.line3Progress) * 18,
      getNotificationExcerpt(notification),
      COLOR_TEXT_SECONDARY,
      textColumnWidth,
      2,
      42,
      toByteAlpha(anim.line3Progress * visibilityFactor)
    );
  }
}

function drawTopBannerStack(
  screenWidth: number,
  screenHeight: number,
  statusBarHeight: number
): void {
  if (activeBanners.length === 0 && bannerVeilState.dim <= 0.001) return;

  rrect(0, 0, screenWidth, screenHeight, 0, 0x000000, toByteAlpha(0.72 * bannerVeilState.dim));
  registerTapZone('banner/veil', 0, 0, screenWidth, screenHeight, () => {
    for (let index = 0; index < activeBanners.length; index++) {
      dismissBannerItem(activeBanners[index]);
    }
  });

  let currentTopY = statusBarHeight + 12;
  for (let bannerIndex = 0; bannerIndex < activeBanners.length; bannerIndex++) {
    const bannerItem = activeBanners[bannerIndex];
    const notification = bannerItem.notification;

    const cardWidth = 560;
    const iconSize = 44;
    const innerPadding = 16;
    const appHeaderFont = Fonts.tinyBold;
    const titleFont = Fonts.smallBold;
    const bodyFont = Fonts.small;
    const lineHeight = 20;

    const cardX = (screenWidth - cardWidth) / 2;
    const textX = cardX + innerPadding + iconSize + 14;
    const textMaxWidth = cardWidth - (textX - cardX) - innerPadding;

    const bodyText =
      (notification.subtitle !== '' ? notification.subtitle + ' · ' : '') +
      notification.body;
    const bodyLineCount =
      bodyText === '' ? 0 : textWidth(bodyFont, bodyText, 0) > textMaxWidth ? 2 : 1;

    const cardHeight =
      Math.max(
        iconSize,
        fontAscent(appHeaderFont) +
          8 +
          fontAscent(titleFont) +
          (bodyLineCount > 0 ? 8 : 0) +
          lineHeight * bodyLineCount
      ) +
      innerPadding * 2;

    const animatedCardY =
      currentTopY + bannerItem.slideOffsetFactor * (cardHeight + statusBarHeight + 20);

    drawCardShadow(cardX, animatedCardY, cardWidth, cardHeight, 22);
    rrect(cardX, animatedCardY, cardWidth, cardHeight, 22, COLOR_CARD_ELEVATED, 255);
    drawNotificationAppIcon(notification, cardX + innerPadding, animatedCardY + innerPadding, iconSize);

    const timeLabel = formatBannerTimeLabel(notification.timestampSeconds);
    drawLabel(
      appHeaderFont,
      textX,
      animatedCardY + innerPadding,
      formatNotificationAppHeader(notification).toUpperCase(),
      COLOR_TEXT_SECONDARY,
      textMaxWidth - textWidth(appHeaderFont, timeLabel, 0) - 12
    );
    drawLabel(
      appHeaderFont,
      cardX + cardWidth - innerPadding - textWidth(appHeaderFont, timeLabel, 0),
      animatedCardY + innerPadding,
      timeLabel,
      COLOR_TEXT_SECONDARY
    );

    let lineY = animatedCardY + innerPadding + fontAscent(appHeaderFont) + 8;
    drawLabel(
      titleFont,
      textX,
      lineY,
      notification.title !== '' ? notification.title : notification.appName,
      COLOR_TEXT_PRIMARY,
      textMaxWidth
    );
    lineY += fontAscent(titleFont) + 8;

    if (bodyLineCount > 0) {
      drawWrappedText(bodyFont, textX, lineY, bodyText, COLOR_TEXT_PRIMARY, textMaxWidth, 2, lineHeight);
    }

    const capturedBanner = bannerItem;
    registerTapZone('banner/' + bannerIndex, cardX, animatedCardY, cardWidth, cardHeight, () => {
      openNotificationOnMac(capturedBanner.notification.id);
      dismissBannerItem(capturedBanner);
    });

    currentTopY += (cardHeight + 10) * Math.max(0, 1 + bannerItem.slideOffsetFactor);
  }
}

export class NotificationOverlayNode extends DisplayObject {
  constructor() {
    super('NotificationOverlay');
  }

  override onDraw(screenWidth: number, screenHeight: number): void {
    drawNotificationOverlayLayer(screenWidth, screenHeight, STATUS_BAR_HEIGHT);
  }
}
