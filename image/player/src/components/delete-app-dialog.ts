// ============================================================================
// components/delete-app-dialog.ts — "Delete this app?", over the page
// ============================================================================
// Asked before an app leaves the device; it takes every tap while it is open (Escape cancels it).

import { rrect, shadow } from 'zinc:gfx';
import { BUTTON_HEIGHT, COLOR_CARD, COLOR_TEXT_PRIMARY, COLOR_TEXT_SECONDARY, TEXT_FORM_WIDTH } from '../constants';
import { Fonts } from '../fonts';
import { DisplayObject } from '../core/display';
import { registerTapZone } from '../core/input';
import { InstalledApp } from '../services/apps';
import { appState, cancelDeleteApp, confirmDeleteApp } from '../state';
import { BUTTON_DANGER, BUTTON_SECONDARY, drawButton, measureButton } from './buttons';
import { countWrappedLines, drawLabel, drawWrappedText } from './primitives';

const DIALOG_PADDING = 22;
const TEXT_LINE_HEIGHT = 22;

export class DeleteAppDialogNode extends DisplayObject {
  constructor() {
    super('DeleteAppDialog');
  }

  override onDraw(stageWidth: number, stageHeight: number): void {
    if (appState.appToDelete === null) return;
    const app = appState.appToDelete as InstalledApp;
    rrect(0, 0, stageWidth, stageHeight, 0, 0x000000, 150);
    registerTapZone('delete/veil', 0, 0, stageWidth, stageHeight, () => {}, false);

    const cardWidth = Math.min(TEXT_FORM_WIDTH, stageWidth - 32);
    const innerWidth = cardWidth - DIALOG_PADDING * 2;
    const text = 'It is removed from this device. You can send it again from your computer.';
    const textLines = countWrappedLines(Fonts.label, text, innerWidth, 3);
    const cardHeight = DIALOG_PADDING * 2 + 28 + 10 + textLines * TEXT_LINE_HEIGHT + 22 + BUTTON_HEIGHT;
    const cardX = Math.round((stageWidth - cardWidth) / 2);
    const cardY = Math.round((stageHeight - cardHeight) / 2);
    shadow(cardX, cardY + 8, cardWidth, cardHeight, 18, 30, 0x000000, 160);
    rrect(cardX, cardY, cardWidth, cardHeight, 18, COLOR_CARD, 255);

    const innerX = cardX + DIALOG_PADDING;
    let cursorY = cardY + DIALOG_PADDING;
    drawLabel(Fonts.heading, innerX, cursorY, 'Delete “' + app.title + '”?', COLOR_TEXT_PRIMARY, innerWidth);
    cursorY += 28 + 10;
    cursorY += drawWrappedText(Fonts.label, innerX, cursorY, text, COLOR_TEXT_SECONDARY, innerWidth, 3, TEXT_LINE_HEIGHT) + 22;

    const deleteWidth = measureButton('Delete', 'trash');
    drawButton('delete/confirm', innerX + innerWidth - deleteWidth, cursorY, deleteWidth, 'Delete', 'trash', BUTTON_DANGER, confirmDeleteApp);
    const cancelWidth = measureButton('Cancel', '');
    drawButton('delete/cancel', innerX + innerWidth - deleteWidth - 10 - cancelWidth, cursorY, cancelWidth, 'Cancel', '', BUTTON_SECONDARY, cancelDeleteApp);
  }
}
