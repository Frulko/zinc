// ============================================================================
// pages/crash/crash-page.ts — The app stopped: why, and what to do
// ============================================================================
// zinc-session wrote crash.txt when the app ended with an error: its exit status, the time and its last lines, which
// scroll in a box that opens on the last one.

import { lineHeight, rrect } from 'zinc:gfx';
import {
  BUTTON_HEIGHT,
  COLOR_BACKGROUND,
  COLOR_CARD,
  COLOR_DANGER,
  COLOR_INSET,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  CORNER_RADIUS,
  PAGE_PADDING,
  TOP_BAR_HEIGHT,
} from '../../constants';
import { Fonts } from '../../fonts';
import { DisplayObject } from '../../core/display';
import { ScrollBox, beginScrollBox, endScrollBox, isLocalRectVisible } from '../../core/input';
import { appState, dismissCrash, refreshSystem, startApp } from '../../state';
import { BUTTON_PRIMARY, BUTTON_SECONDARY, drawButton } from '../../components/buttons';
import { drawGlyph, drawLabel } from '../../components/primitives';

const CARD_PADDING = 22;
const OUTPUT_PADDING = 14;

export class CrashPageNode extends DisplayObject {
  private outputScroll: ScrollBox = new ScrollBox();
  /** The output opens on its last line, once. */
  private isScrolledToEnd: boolean = false;

  constructor() {
    super('CrashPage');
  }

  override onAddedToStage(): void {
    this.isScrolledToEnd = false;
    refreshSystem();
  }

  override onDraw(pageWidth: number, pageHeight: number): void {
    rrect(0, 0, pageWidth, pageHeight, 0, COLOR_BACKGROUND, 255);
    rrect(0, 0, pageWidth, TOP_BAR_HEIGHT, 0, COLOR_DANGER, 70);
    const report = appState.crashReport;
    if (report === null) return;

    const cardX = PAGE_PADDING;
    const cardY = TOP_BAR_HEIGHT + 12;
    const cardWidth = pageWidth - PAGE_PADDING * 2;
    const cardHeight = pageHeight - cardY - PAGE_PADDING;
    rrect(cardX, cardY, cardWidth, cardHeight, CORNER_RADIUS + 4, COLOR_CARD, 255);

    const innerX = cardX + CARD_PADDING;
    const innerWidth = cardWidth - CARD_PADDING * 2;
    let cursorY = cardY + CARD_PADDING;
    drawGlyph('triangle-alert', innerX, cursorY + 2, 26, COLOR_DANGER);
    drawLabel(Fonts.title, innerX + 38, cursorY, 'The app stopped (exit ' + report.exitStatus + ')', COLOR_TEXT_PRIMARY, innerWidth - 38);
    cursorY += lineHeight(Fonts.title) + 4;
    drawLabel(Fonts.small, innerX + 38, cursorY, report.app + '   ·   ' + report.time, COLOR_TEXT_SECONDARY, innerWidth - 38);
    cursorY += 28;

    const buttonsY = cardY + cardHeight - CARD_PADDING - BUTTON_HEIGHT;
    const outputHeight = buttonsY - 16 - cursorY;
    rrect(innerX, cursorY, innerWidth, outputHeight, 10, COLOR_INSET, 255);
    const codeLineHeight = lineHeight(Fonts.codeSmall) + 3;
    const scroll = this.outputScroll;
    scroll.contentHeight = report.output.length * codeLineHeight + OUTPUT_PADDING * 2;
    scroll.viewportHeight = outputHeight;
    if (!this.isScrolledToEnd) {
      scroll.scrollY = scroll.maxScrollY();
      this.isScrolledToEnd = true;
    }
    scroll.clamp();
    beginScrollBox(scroll, innerX, cursorY, innerWidth, outputHeight);
    for (let index = 0; index < report.output.length; index++) {
      const lineY = cursorY + OUTPUT_PADDING + index * codeLineHeight - scroll.scrollY;
      if (!isLocalRectVisible(innerX, lineY, innerWidth, codeLineHeight)) continue;
      drawLabel(Fonts.codeSmall, innerX + OUTPUT_PADDING, lineY, report.output[index], COLOR_TEXT_PRIMARY, innerWidth - OUTPUT_PADDING * 2);
    }
    endScrollBox();

    const restartWidth = drawButton('crash/restart', innerX, buttonsY, 0, 'Restart the app', 'rotate-ccw', BUTTON_PRIMARY, startApp);
    drawButton('crash/dismiss', innerX + restartWidth + 12, buttonsY, 0, 'Dismiss', 'house', BUTTON_SECONDARY, dismissCrash);
  }
}
