// ============================================================================
// pages/settings/display-section.ts — The screen's rotation
// ============================================================================
// Rotation turns the whole screen (the bar, the app, the touch) clockwise; the session starts again to apply it (zinc-admin rotation).

import { COLOR_TEXT_SECONDARY } from '../../constants';
import { Fonts } from '../../fonts';
import { DisplayObject } from '../../core/display';
import { appState, screenRotation, setScreenRotation } from '../../state';
import { BUTTON_PRIMARY, BUTTON_SECONDARY, drawButton } from '../../components/buttons';
import { drawLabel } from '../../components/primitives';
import { drawMessage, drawSectionHeading } from '../../components/rows';

const SECTION_PADDING = 24;
const ROTATIONS: number[] = [0, 90, 180, 270];

export class DisplaySectionNode extends DisplayObject {
  constructor() {
    super('DisplaySection');
  }

  override onDraw(sectionWidth: number, sectionHeight: number): void {
    const x = SECTION_PADDING;
    const width = sectionWidth - SECTION_PADDING * 2;
    let cursorY = 20;
    drawSectionHeading(x, cursorY, 'Display');
    cursorY += 52;
    drawLabel(Fonts.labelBold, x, cursorY, 'Rotation', COLOR_TEXT_SECONDARY, width);
    cursorY += 28;
    let buttonX = x;
    for (let index = 0; index < ROTATIONS.length; index++) {
      const degrees = ROTATIONS[index];
      const buttonWidth = drawButton('display/rotation/' + degrees, buttonX, cursorY, 0, degrees + '°', '',
        screenRotation() === degrees ? BUTTON_PRIMARY : BUTTON_SECONDARY, () => setScreenRotation(degrees), appState.busyAction === '');
      buttonX += buttonWidth + 10;
    }
    cursorY += 56;
    drawLabel(Fonts.small, x, cursorY, 'Turns the screen clockwise, touch included. The shell restarts to apply it.', COLOR_TEXT_SECONDARY, width);
    cursorY += 40;
    drawMessage(x, cursorY, width, appState.message, appState.isMessageError);
  }
}
