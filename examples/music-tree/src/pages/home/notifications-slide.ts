// ============================================================================
// pages/home/notifications-slide.ts — Slide 4: Notifications and Mac pairing
// ============================================================================
// Shows the list of notifications received from the Mac (grouped by
// application, swipe left to delete, tap to open on
// the Mac) or the 3-step pairing assistant if no Mac is linked yet.

import { rrect, textWidth, fontAscent, setTransform } from 'zinc:gfx';
import * as link from 'zinc:link';
import {
  COLOR_ACCENT,
  COLOR_CARD,
  COLOR_DANGER,
  COLOR_FILL,
  COLOR_GREEN,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  COLOR_TEXT_TERTIARY,
} from '../../constants';
import { FONT_PAIRING_CODE, Fonts } from '../../fonts';
import { DisplayObject, ScrollBox, beginScrollBox, endScrollBox, registerDragZone, uiState } from 'zinc:stage';
import {
  drawCenteredText,
  drawGlyph,
  drawLabel,
  drawWrappedText,
  drawSeparatorLine,
} from '../../components/primitives';
import { drawPillButton } from '../../components/buttons';
import {
  countEmojiPlaceholders,
  drawInlineEmojiText,
  drawWrappedEmojiText,
} from '../../components/emoji-text';
import { drawActivitySpinner } from '../../components/slider';
import {
  MacNotification,
  storedNotifications,
  pairedMacHostname,
  openChannelsCount,
  isMacPaired,
  pairingWizardStep,
  pairingPinCode,
  isPairingCodeExpired,
  failedPairingAttempts,
  showManualIpInstructions,
  isAddingAnotherMac,
  notificationsScrollBox,
  draggedNotificationRowId,
  draggedNotificationDeltaX,
  draggedNotificationAxis,
  dragStartX,
  dragStartY,
  dragStartScrollY,
  setNotificationDragState,
  setPairingUiState,
  requestNewPairingCode,
  cancelPairingWizard,
  clearAllNotifications,
  removeNotificationById,
  openNotificationOnMac,
  drawNotificationAppIcon,
  formatNotificationAppHeader,
  formatRelativeTimeAgo,
  getNotificationTitleText,
  getNotificationBodyText,
  getNotificationEmojiImages,
  relayListeningPort,
  TEST_RELAY_FEED_FILE,
} from '../../services/notify-service';

export class NotificationsSlideNode extends DisplayObject {
  private readonly pairingScroll = new ScrollBox();
  constructor() {
    super('NotificationsSlide');
  }

  override onUpdate(deltaSeconds: number): void {
    if (this.pairingScroll.stepInertia(deltaSeconds)) uiState.dirty = true;
  }

  override onDraw(viewWidth: number, viewHeight: number): void {
    if (
      (!isMacPaired && TEST_RELAY_FEED_FILE === '') ||
      isAddingAnotherMac ||
      pairingWizardStep === 3
    ) {
      const layoutHeight = Math.max(viewHeight, viewWidth < 700 ? 760 : 640);
      this.pairingScroll.contentHeight = layoutHeight;
      this.pairingScroll.viewportHeight = viewHeight;
      this.pairingScroll.clamp();
      beginScrollBox(this.pairingScroll, 0, 0, viewWidth, viewHeight);
      const worldX = uiState.offsetX;
      const worldY = uiState.offsetY;
      uiState.offsetY -= this.pairingScroll.scrollY;
      setTransform(1, 0, 0, 1, worldX, uiState.offsetY);
      this.drawPairingAssistant(viewWidth, layoutHeight);
      uiState.offsetY = worldY;
      setTransform(1, 0, 0, 1, worldX, worldY);
      endScrollBox();
      return;
    }

    const contentStartX = viewWidth < 700 ? 24 : 64;
    const contentWidth = viewWidth - contentStartX * 2;
    const compact = viewWidth < 700;
    const statusY = compact ? 118 : 70;
    drawLabel(compact ? Fonts.heading : Fonts.hero, contentStartX, 18, 'Notifications', COLOR_TEXT_PRIMARY, contentWidth);

    const isRelayConnected = TEST_RELAY_FEED_FILE !== '' || openChannelsCount > 0;
    rrect(
      contentStartX + 2,
      statusY + 4,
      10,
      10,
      5,
      isRelayConnected ? COLOR_GREEN : COLOR_TEXT_TERTIARY,
      255
    );
    const connectionStatusText =
      pairedMacHostname !== ''
        ? `${pairedMacHostname} · ${isRelayConnected ? 'connecté' : 'hors ligne'}`
        : 'Mac relié';
    drawLabel(
      Fonts.small,
      contentStartX + 20,
      statusY,
      connectionStatusText,
      COLOR_TEXT_SECONDARY,
      compact ? contentWidth - 20 : contentWidth / 2
    );

    const buttonY = compact ? 64 : 18;
    const buttonMaxWidth = compact ? (contentWidth - 12) / 2 : 0;
    let buttonCursorX = contentStartX + contentWidth;
    if (storedNotifications.length > 0) {
      buttonCursorX -= compact ? buttonMaxWidth : textWidth(Fonts.smallBold, 'Tout effacer', 0) + 36 + 22;
      drawPillButton(
        'notif/clear',
        buttonCursorX,
        buttonY,
        'Tout effacer',
        COLOR_TEXT_PRIMARY,
        COLOR_FILL,
        clearAllNotifications,
        'x',
        40,
        buttonMaxWidth
      );
    }
    if (TEST_RELAY_FEED_FILE === '') {
      buttonCursorX -= (compact ? buttonMaxWidth : textWidth(Fonts.smallBold, 'Ajouter un Mac', 0) + 36 + 22) + 12;
      drawPillButton(
        'notif/add',
        buttonCursorX,
        buttonY,
        'Ajouter un Mac',
        COLOR_TEXT_PRIMARY,
        COLOR_FILL,
        () => {
          setPairingUiState(true, 1, showManualIpInstructions, pairingPinCode);
        },
        'laptop',
        40,
        buttonMaxWidth
      );
    }

    if (storedNotifications.length === 0) {
      const centerY = compact ? (statusY + 34 + viewHeight) / 2 : viewHeight / 2;
      drawGlyph('bell', viewWidth / 2 - 40, centerY - 110, 80, COLOR_TEXT_TERTIARY);
      drawCenteredText(
        Fonts.heading,
        viewWidth / 2,
        centerY - 10,
        'Aucune notification',
        COLOR_TEXT_PRIMARY
      );
      drawCenteredText(
        Fonts.small,
        viewWidth / 2,
        centerY + 26,
        "Celles du Mac s'afficheront ici.",
        COLOR_TEXT_SECONDARY
      );
      return;
    }

    // Grouping by application (most recent group first)
    const groupKeysOrder: string[] = [];
    const notificationsByGroup = new Map<string, MacNotification[]>();
    for (let index = 0; index < storedNotifications.length; index++) {
      const notification = storedNotifications[index];
      const groupKey = notification.appId + '|' + notification.domain;
      if (!notificationsByGroup.has(groupKey)) {
        groupKeysOrder.push(groupKey);
        notificationsByGroup.set(groupKey, [notification]);
      } else {
        (notificationsByGroup.get(groupKey) as MacNotification[]).push(notification);
      }
    }

    const scrollTopY = statusY + 34;
    const itemRowHeight = 92;
    const groupHeaderHeight = 46;

    beginScrollBox(notificationsScrollBox, 0, scrollTopY, viewWidth, viewHeight - scrollTopY);
    let currentY = scrollTopY - notificationsScrollBox.scrollY;

    for (let groupIndex = 0; groupIndex < groupKeysOrder.length; groupIndex++) {
      const groupKey = groupKeysOrder[groupIndex];
      const groupItems = notificationsByGroup.get(groupKey) as MacNotification[];
      const cardHeight = groupHeaderHeight + groupItems.length * itemRowHeight;

      if (currentY < viewHeight && currentY + cardHeight > scrollTopY) {
        rrect(contentStartX, currentY, contentWidth, cardHeight, 18, COLOR_CARD, 255);
        drawNotificationAppIcon(groupItems[0], contentStartX + 16, currentY + 12, 26);
        drawLabel(
          Fonts.smallBold,
          contentStartX + 52,
          currentY + 16,
          formatNotificationAppHeader(groupItems[0]),
          COLOR_TEXT_PRIMARY,
          contentWidth - 200
        );

        const countBadgeText = groupItems.length > 1 ? `${groupItems.length}` : '';
        if (countBadgeText !== '') {
          const badgeWidth = textWidth(Fonts.tinyBold, countBadgeText, 0) + 16;
          rrect(
            contentStartX + contentWidth - 16 - badgeWidth,
            currentY + 14,
            badgeWidth,
            22,
            11,
            COLOR_FILL,
            255
          );
          drawCenteredText(
            Fonts.tinyBold,
            contentStartX + contentWidth - 16 - badgeWidth / 2,
            currentY + 18,
            countBadgeText,
            COLOR_TEXT_PRIMARY
          );
        }

        for (let itemIndex = 0; itemIndex < groupItems.length; itemIndex++) {
          this.drawNotificationRow(
            groupItems[itemIndex],
            contentStartX,
            currentY + groupHeaderHeight + itemIndex * itemRowHeight,
            contentWidth,
            itemRowHeight,
            itemIndex > 0,
            scrollTopY,
            viewHeight
          );
        }
      }
      currentY += cardHeight + 16;
    }

    notificationsScrollBox.contentHeight =
      currentY + notificationsScrollBox.scrollY - scrollTopY + 8;
    endScrollBox();
  }

  private drawNotificationRow(
    notification: MacNotification,
    x: number,
    y: number,
    width: number,
    height: number,
    showTopSeparator: boolean,
    viewportTopY: number,
    viewportBottomY: number
  ): void {
    if (y > viewportBottomY || y + height < viewportTopY) return;

    const rowZoneId = 'nrow/' + notification.id;
    const horizontalDragOffset =
      draggedNotificationRowId === rowZoneId && draggedNotificationAxis === 'x'
        ? draggedNotificationDeltaX
        : 0;

    if (horizontalDragOffset < 0) {
      rrect(
        x + 8,
        y + 2,
        width - 16,
        height - 4,
        14,
        COLOR_DANGER,
        Math.min(255, Math.round(-horizontalDragOffset * 3)) as i32
      );
      drawGlyph('trash', x + width - 56, y + height / 2 - 14, 28, COLOR_TEXT_PRIMARY);
    }

    const rowDrawX = x + horizontalDragOffset;
    if (horizontalDragOffset < 0 || uiState.pressedZoneId === rowZoneId) {
      rrect(
        rowDrawX,
        y,
        width,
        height,
        14,
        uiState.pressedZoneId === rowZoneId && horizontalDragOffset === 0
          ? 0x2c2c2e
          : COLOR_CARD,
        255
      );
    }

    if (showTopSeparator) {
      drawSeparatorLine(rowDrawX + 20, y, width - 40);
    }

    const relativeTimeText = formatRelativeTimeAgo(notification.timestampSeconds);
    const emojiImages = getNotificationEmojiImages(notification);
    const titleText = getNotificationTitleText(notification);
    drawInlineEmojiText(
      Fonts.bodyBold,
      rowDrawX + 20,
      y + 12,
      titleText,
      emojiImages,
      0,
      COLOR_TEXT_PRIMARY,
      255,
      width - 60 - textWidth(Fonts.tiny, relativeTimeText, 0)
    );
    drawLabel(
      Fonts.tiny,
      rowDrawX + width - 20 - textWidth(Fonts.tiny, relativeTimeText, 0),
      y + 15,
      relativeTimeText,
      COLOR_TEXT_SECONDARY
    );

    const bodyAndSubtitle = getNotificationBodyText(notification);
    if (bodyAndSubtitle !== '') {
      drawWrappedEmojiText(
        Fonts.small,
        rowDrawX + 20,
        y + 40,
        bodyAndSubtitle,
        emojiImages,
        countEmojiPlaceholders(titleText),
        COLOR_TEXT_SECONDARY,
        width - 40,
        2,
        20
      );
    }

    registerDragZone(rowZoneId, x, y, width, height, (pointerX: number, pointerY: number, phase: i32) => {
      if (phase === 0) {
        setNotificationDragState(
          rowZoneId,
          0,
          '',
          pointerX,
          pointerY,
          notificationsScrollBox.scrollY
        );
        return;
      }
      if (phase === 3) {
        setNotificationDragState('', 0, '', 0, 0, 0);
        return;
      }

      const deltaX = pointerX - dragStartX;
      const deltaY = pointerY - dragStartY;
      let currentAxis = draggedNotificationAxis;
      if (currentAxis === '' && (Math.abs(deltaX) > 12 || Math.abs(deltaY) > 12)) {
        currentAxis = Math.abs(deltaX) > Math.abs(deltaY) ? 'x' : 'y';
      }

      let currentDeltaX = draggedNotificationDeltaX;
      if (currentAxis === 'x') {
        currentDeltaX = Math.min(0, deltaX);
      } else if (currentAxis === 'y') {
        notificationsScrollBox.scrollY = dragStartScrollY - deltaY;
        notificationsScrollBox.clamp();
      }
      setNotificationDragState(
        rowZoneId,
        currentDeltaX,
        currentAxis,
        dragStartX,
        dragStartY,
        dragStartScrollY
      );

      if (phase === 2) {
        if (currentAxis === 'x' && currentDeltaX < -width / 3) {
          removeNotificationById(notification.id);
        } else if (currentAxis === '') {
          openNotificationOnMac(notification.id);
        }
        setNotificationDragState('', 0, '', 0, 0, 0);
      }
      uiState.dirty = true;
    });
  }

  private drawPairingAssistant(viewWidth: number, viewHeight: number): void {
    const contentStartX = viewWidth < 700 ? 24 : 64;
    const contentWidth = viewWidth - contentStartX * 2;
    drawLabel(
      viewWidth < 420 ? Fonts.heading : Fonts.hero,
      contentStartX,
      18,
      isAddingAnotherMac ? 'Ajouter un Mac' : 'Notifications du Mac',
      COLOR_TEXT_PRIMARY,
      contentWidth - (isAddingAnotherMac ? 144 : 0)
    );

    if (isAddingAnotherMac) {
      drawPillButton(
        'pair/cancel',
        contentStartX + contentWidth - 130,
        18,
        'Annuler',
        COLOR_TEXT_PRIMARY,
        COLOR_FILL,
        cancelPairingWizard,
        '',
        40
      );
    }

    const stepTitles: string[] = ['Installer', 'Appairer', 'Terminé'];
    for (let stepIndex = 0; stepIndex < 3; stepIndex++) {
      const stepX = contentStartX + stepIndex * (viewWidth < 700 ? contentWidth / 3 : 200);
      const isCurrentStep = pairingWizardStep === stepIndex + 1;
      const isCompletedStep = pairingWizardStep > stepIndex + 1;

      rrect(
        stepX,
        78,
        28,
        28,
        14,
        isCurrentStep ? COLOR_ACCENT : isCompletedStep ? COLOR_GREEN : COLOR_FILL,
        255
      );
      if (isCompletedStep) {
        drawGlyph('check', stepX + 6, 84, 16, COLOR_TEXT_PRIMARY, 255, 3);
      } else {
        drawCenteredText(
          Fonts.smallBold,
          stepX + 14,
          92 - fontAscent(Fonts.smallBold) / 2 - 1,
          '' + (stepIndex + 1),
          COLOR_TEXT_PRIMARY
        );
      }
      drawLabel(
        Fonts.smallBold,
        stepX + 38,
        84,
        stepTitles[stepIndex],
        isCurrentStep ? COLOR_TEXT_PRIMARY : COLOR_TEXT_SECONDARY,
        viewWidth < 700 ? contentWidth / 3 - 38 : 140
      );
    }

    const cardTopY = 136;
    const cardHeight = viewHeight - cardTopY - 30;
    rrect(contentStartX, cardTopY, contentWidth, cardHeight, 20, COLOR_CARD, 255);

    const innerX = contentStartX + (viewWidth < 700 ? 20 : 40);
    const innerWidth = contentWidth - (viewWidth < 700 ? 40 : 80);

    if (pairingWizardStep === 1) {
      drawGlyph('laptop', innerX, cardTopY + 40, 56, COLOR_ACCENT);
      drawLabel(
        Fonts.title,
        innerX + 80,
        cardTopY + 48,
        'Installe Zinc Relay sur ton Mac',
        COLOR_TEXT_PRIMARY,
        innerWidth - 80
      );
      const instructionLines: string[] = [
        'Zinc Relay vit dans la barre des menus du Mac. Il envoie à cette tablette',
        'les notifications que tu choisis, app par app et site par site.',
        'Sur le Mac : zinc run examples/notify-relay, puis ouvre ses réglages.',
        'La tablette et le Mac doivent être sur le même Wi-Fi.',
      ];
      let instructionY = cardTopY + 130;
      for (let lineIndex = 0; lineIndex < instructionLines.length; lineIndex++) {
        instructionY += drawWrappedText(Fonts.body, innerX, instructionY, instructionLines[lineIndex],
          lineIndex < 2 ? COLOR_TEXT_PRIMARY : COLOR_TEXT_SECONDARY, innerWidth, 4, 26) + 8;
      }
      drawPillButton(
        'pair/next',
        innerX,
        cardTopY + cardHeight - 80,
        viewWidth < 700 ? 'Continuer' : 'Zinc Relay est ouvert, continuer',
        0x000000,
        0xffffff,
        () => {
          setPairingUiState(isAddingAnotherMac, 2, showManualIpInstructions, pairingPinCode);
          requestNewPairingCode();
        },
        'chevron-right',
        48
      );
      return;
    }

    if (pairingWizardStep === 2) {
      if (pairingPinCode === '' && !isPairingCodeExpired) {
        requestNewPairingCode();
      }
      drawLabel(
        Fonts.heading,
        innerX,
        cardTopY + 34,
        'Dans Zinc Relay, choisis « Musique » et tape ce code :',
        COLOR_TEXT_PRIMARY,
        innerWidth
      );
      const formattedPin =
        pairingPinCode === ''
          ? '––– –––'
          : pairingPinCode.slice(0, 3) + ' ' + pairingPinCode.slice(3);

      if (isPairingCodeExpired) {
        drawLabel(Fonts.title, innerX, cardTopY + 110, 'Le code a expiré.', COLOR_TEXT_SECONDARY, innerWidth);
        drawPillButton(
          'pair/again',
          innerX,
          cardTopY + 170,
          'Nouveau code',
          COLOR_TEXT_PRIMARY,
          COLOR_FILL,
          requestNewPairingCode,
          'refresh-cw'
        );
      } else {
        drawLabel(innerWidth < 400 ? Fonts.hero : FONT_PAIRING_CODE, innerX, cardTopY + 84, formattedPin, COLOR_TEXT_PRIMARY, innerWidth);
        drawActivitySpinner(innerX + 14, cardTopY + 236, 12);
        const waitingMessage =
          failedPairingAttempts > 0
            ? `Code erroné (${failedPairingAttempts} essai${
                failedPairingAttempts > 1 ? 's' : ''
              } sur 3). En attente du Mac…`
            : 'En attente du Mac…';
        drawLabel(
          Fonts.body,
          innerX + 40,
          cardTopY + 224,
          waitingMessage,
          failedPairingAttempts > 0 ? COLOR_ACCENT : COLOR_TEXT_SECONDARY,
          innerWidth - 40
        );
        drawLabel(
          Fonts.small,
          innerX,
          cardTopY + 262,
          'Le code vaut cinq minutes.',
          COLOR_TEXT_TERTIARY,
          innerWidth
        );
      }

      const localAddresses = link.addresses();
      const addressLabel =
        localAddresses.length > 0
          ? `${localAddresses[0]}  port ${relayListeningPort}`
          : 'pas de réseau';
      drawSeparatorLine(innerX, cardTopY + cardHeight - 120, innerWidth);

      if (!showManualIpInstructions) {
        drawLabel(
          Fonts.small,
          innerX,
          cardTopY + cardHeight - 98,
          `Adresse de la tablette : ${addressLabel}`,
          COLOR_TEXT_SECONDARY,
          innerWidth
        );
        drawPillButton(
          'pair/nodisc',
          innerX,
          cardTopY + cardHeight - 66,
          'Le Mac ne trouve pas la tablette ?',
          COLOR_TEXT_PRIMARY,
          COLOR_FILL,
          () => {
            setPairingUiState(isAddingAnotherMac, pairingWizardStep, true, pairingPinCode);
          },
          'wifi',
          40
        );
      } else {
        drawLabel(
          Fonts.small,
          innerX,
          cardTopY + cardHeight - 104,
          'Ton réseau bloque la découverte : dans Zinc Relay, choisis « Saisir une adresse » et tape',
          COLOR_TEXT_SECONDARY,
          innerWidth
        );
        drawLabel(Fonts.title, innerX, cardTopY + cardHeight - 72, addressLabel, COLOR_TEXT_PRIMARY, innerWidth);
      }
      return;
    }

    drawGlyph('check', innerX, cardTopY + 40, 56, COLOR_GREEN, 255, 3);
    drawLabel(
      Fonts.title,
      innerX + 80,
      cardTopY + 48,
      pairedMacHostname !== '' ? `${pairedMacHostname} est relié` : 'Le Mac est relié',
      COLOR_TEXT_PRIMARY,
      innerWidth - 80
    );
    drawLabel(
      Fonts.body,
      innerX,
      cardTopY + 130,
      'Ses notifications apparaîtront sur la tablette, même écran éteint,',
      COLOR_TEXT_PRIMARY,
      innerWidth
    );
    drawLabel(
      Fonts.body,
      innerX,
      cardTopY + 164,
      "et resteront dans cette page. Glisse une notification vers la gauche pour l'effacer.",
      COLOR_TEXT_SECONDARY,
      innerWidth
    );
    drawPillButton(
      'pair/done',
      innerX,
      cardTopY + cardHeight - 80,
      'Terminé',
      0x000000,
      0xffffff,
      () => {
        setPairingUiState(false, 1, false, pairingPinCode);
      },
      'check',
      48
    );
  }
}
