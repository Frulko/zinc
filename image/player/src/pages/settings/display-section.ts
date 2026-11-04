// ============================================================================
// pages/settings/display-section.ts — The screen's rotation and its sleep
// ============================================================================
// Rotation turns the whole screen (the bar, the app, the touch) clockwise; the session starts again to apply it (zinc-admin rotation).
// Sleep: the delay with no input, the transition, sleep now.

import { BUTTON_HEIGHT, COLOR_TEXT_SECONDARY, SLEEP_DELAYS, SLEEP_FADES, SleepOption } from '../../constants';
import { Fonts } from '../../fonts';
import { DisplayObject } from '../../core/display';
import { screenPower } from '../../core/screen-power';
import { appState, screenRotation, setScreenRotation, setSleepDelay, setSleepFade } from '../../state';
import { BUTTON_PRIMARY, BUTTON_SECONDARY, drawButton, measureButton } from '../../components/buttons';
import { drawLabel, drawWrappedText } from '../../components/primitives';
import { drawMessage, drawSectionHeading } from '../../components/rows';

const SECTION_PADDING = 24;
const ROTATIONS: number[] = [0, 90, 180, 270];
const BUTTON_GAP = 8;
const ROW_GAP = 8;
const LABEL_HEIGHT = 24;

/** One choice per button, on as many rows as the width needs. Returns the y under them. */
function drawChoices(zone: string, x: number, y: number, width: number, options: SleepOption[], current: number, choose: (seconds: number) => void): number {
  let cursorX = x;
  let cursorY = y;
  for (let index = 0; index < options.length; index++) {
    const option = options[index];
    if (cursorX > x && cursorX + measureButton(option.label, '') > x + width) {
      cursorX = x;
      cursorY += BUTTON_HEIGHT + BUTTON_GAP;
    }
    cursorX += BUTTON_GAP + drawButton(zone + index, cursorX, cursorY, 0, option.label, '',
      current === option.seconds ? BUTTON_PRIMARY : BUTTON_SECONDARY, () => choose(option.seconds));
  }
  return cursorY + BUTTON_HEIGHT + ROW_GAP;
}

export class DisplaySectionNode extends DisplayObject {
  constructor() {
    super('DisplaySection');
  }

  override onDraw(sectionWidth: number, sectionHeight: number): void {
    const x = SECTION_PADDING;
    const width = sectionWidth - SECTION_PADDING * 2;
    let cursorY = 16;
    drawSectionHeading(x, cursorY, 'Display');
    cursorY += 44;
    drawLabel(Fonts.labelBold, x, cursorY, 'Rotation (the shell restarts to apply it)', COLOR_TEXT_SECONDARY, width);
    cursorY += LABEL_HEIGHT;
    let buttonX = x;
    for (let index = 0; index < ROTATIONS.length; index++) {
      const degrees = ROTATIONS[index];
      const buttonWidth = drawButton('display/rotation/' + degrees, buttonX, cursorY, 0, degrees + '°', '',
        screenRotation() === degrees ? BUTTON_PRIMARY : BUTTON_SECONDARY, () => setScreenRotation(degrees), appState.busyAction === '');
      buttonX += buttonWidth + 10;
    }
    cursorY += BUTTON_HEIGHT + ROW_GAP;

    drawLabel(Fonts.labelBold, x, cursorY, 'Turn off after', COLOR_TEXT_SECONDARY, width);
    cursorY = drawChoices('display/delay/', x, cursorY + LABEL_HEIGHT, width, SLEEP_DELAYS, appState.config.sleepDelaySeconds, setSleepDelay);

    drawLabel(Fonts.labelBold, x, cursorY, 'Transition', COLOR_TEXT_SECONDARY, width);
    cursorY = drawChoices('display/fade/', x, cursorY + LABEL_HEIGHT, width, SLEEP_FADES, appState.config.sleepFadeSeconds, setSleepFade);

    drawButton('display/sleep', x, cursorY, 0, 'Turn off now', 'moon', BUTTON_SECONDARY, () => screenPower.sleepNow());
    cursorY += BUTTON_HEIGHT + ROW_GAP;
    drawWrappedText(Fonts.small, x, cursorY, 'A touch, a key or the mouse wakes the screen and presses nothing.', COLOR_TEXT_SECONDARY, width, 2, 20, 255);
    cursorY += 24;
    drawMessage(x, cursorY, width, appState.message, appState.isMessageError);
  }
}
