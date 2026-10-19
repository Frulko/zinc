// ============================================================================
// components/notification-overlay.ts — macOS notifications overlay
// ============================================================================
// Draws above the whole app (status bar included):
// 1. Either the full-screen animation inspired by iOS StandBy (on the clock screen
//    or when the screen was asleep).
// 2. Or the grey banner cards stacked at the top of the screen.

import { rrect, textWidth, fontAscent, drawImage, imageWidth, imageHeight } from 'zinc:gfx';
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
} from './primitives';
import {
  countEmojiPlaceholders,
  drawInlineEmojiText,
  drawWrappedEmojiText,
  measureInlineEmojiText,
} from './emoji-text';
import {
  StandByOverlayAnimation,
  currentStandByOverlay,
  overlayDimState,
  onStandByOverlayTapped,
  drawNotificationAvatarOrIcon,
  drawNotificationAppIcon,
  getNotificationSenderText,
  getNotificationSenderFirstEmoji,
  getNotificationExcerpt,
  getNotificationExcerptFirstEmoji,
  getNotificationTitleText,
  getNotificationBodyText,
  getNotificationEmojiImages,
  getNotificationAttachmentImage,
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
 * Draws the notifications overlay at the screen coordinates `(0, 0, screenWidth, screenHeight)`.
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

  // A photo the message carries shows large on the right as the text comes in; the face and the margins shrink for it.
  const attachmentImage = getNotificationAttachmentImage(notification);
  const hasPhoto = attachmentImage >= 0;
  const initialDiameter = 210;
  const compactDiameter = hasPhoto ? 100 : 128;
  const targetLeftCenterX = (hasPhoto ? 56 : 90) + compactDiameter / 2;

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

  const emojiImages = getNotificationEmojiImages(notification);
  const senderText = getNotificationSenderText(notification);
  const senderFirstEmoji = getNotificationSenderFirstEmoji(notification);
  if (centeredLabelsOpacity > 0.01) {
    const nameWidth = Math.min(screenWidth - 80, measureInlineEmojiText(FONT_STANDBY_NAME, senderText));
    drawInlineEmojiText(
      FONT_STANDBY_NAME,
      currentCenterX - nameWidth / 2,
      currentCenterY + currentDiameter / 2 + 28,
      senderText,
      emojiImages,
      senderFirstEmoji,
      COLOR_TEXT_PRIMARY,
      toByteAlpha(centeredLabelsOpacity),
      nameWidth
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

  let photoWidth = 0;
  let photoHeight = 0;
  if (hasPhoto) {
    const scale = Math.min(
      Math.min(460, screenWidth * 0.44) / imageWidth(attachmentImage),
      (screenHeight - 120) / imageHeight(attachmentImage)
    );
    photoWidth = imageWidth(attachmentImage) * scale;
    photoHeight = imageHeight(attachmentImage) * scale;
  }
  const textColumnX = targetLeftCenterX + compactDiameter / 2 + (hasPhoto ? 32 : 44);
  const textColumnWidth = screenWidth - textColumnX - (hasPhoto ? 48 + photoWidth + 32 : 90);
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
    // a long name takes the smaller size before it is cut
    const senderFont =
      measureInlineEmojiText(FONT_STANDBY_SENDER, senderText) <= textColumnWidth
        ? FONT_STANDBY_SENDER
        : FONT_STANDBY_NAME;
    drawInlineEmojiText(
      senderFont,
      textColumnX,
      textBaseY + 34 + (1 - anim.line2Progress) * 18 +
        (fontAscent(FONT_STANDBY_SENDER) - fontAscent(senderFont)) / 2,
      senderText,
      emojiImages,
      senderFirstEmoji,
      COLOR_TEXT_PRIMARY,
      toByteAlpha(anim.line2Progress * visibilityFactor),
      textColumnWidth
    );
  }
  if (anim.line3Progress > 0) {
    drawWrappedEmojiText(
      FONT_STANDBY_EXCERPT,
      textColumnX,
      textBaseY + 108 + (1 - anim.line3Progress) * 18,
      getNotificationExcerpt(notification),
      emojiImages,
      getNotificationExcerptFirstEmoji(notification),
      COLOR_TEXT_SECONDARY,
      textColumnWidth,
      2,
      42,
      toByteAlpha(anim.line3Progress * visibilityFactor)
    );
    if (hasPhoto) {
      drawImage(
        attachmentImage,
        screenWidth - 48 - photoWidth,
        screenHeight / 2 - photoHeight / 2 + (1 - anim.line3Progress) * 18,
        photoWidth,
        photoHeight,
        toByteAlpha(anim.line3Progress * visibilityFactor),
        20
      );
    }
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

    // a photo the message carries: a thumbnail on the right, as iOS does
    const attachmentImage = getNotificationAttachmentImage(notification);
    const hasPhoto = attachmentImage >= 0;
    const cardX = (screenWidth - cardWidth) / 2;
    const textX = cardX + innerPadding + iconSize + 14;
    const textMaxWidth = cardWidth - (textX - cardX) - innerPadding - (hasPhoto ? iconSize + 12 : 0);

    const emojiImages = getNotificationEmojiImages(notification);
    const titleText = getNotificationTitleText(notification);
    const bodyText = getNotificationBodyText(notification);
    const bodyLineCount =
      bodyText === '' ? 0 : measureInlineEmojiText(bodyFont, bodyText) > textMaxWidth ? 2 : 1;

    const cardHeight =
      Math.max(
        iconSize + (hasPhoto ? fontAscent(appHeaderFont) + 8 : 0),
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
    if (hasPhoto) {
      // fitted in the square, its shape kept
      const scale = Math.min(iconSize / imageWidth(attachmentImage), iconSize / imageHeight(attachmentImage));
      const thumbWidth = imageWidth(attachmentImage) * scale;
      const thumbHeight = imageHeight(attachmentImage) * scale;
      drawImage(
        attachmentImage,
        cardX + cardWidth - innerPadding - iconSize + (iconSize - thumbWidth) / 2,
        lineY + (iconSize - thumbHeight) / 2,
        thumbWidth,
        thumbHeight,
        255,
        8
      );
    }
    drawInlineEmojiText(titleFont, textX, lineY, titleText, emojiImages, 0, COLOR_TEXT_PRIMARY, 255, textMaxWidth);
    lineY += fontAscent(titleFont) + 8;

    if (bodyLineCount > 0) {
      drawWrappedEmojiText(
        bodyFont,
        textX,
        lineY,
        bodyText,
        emojiImages,
        countEmojiPlaceholders(titleText),
        COLOR_TEXT_PRIMARY,
        textMaxWidth,
        2,
        lineHeight
      );
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
