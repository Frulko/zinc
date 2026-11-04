// ============================================================================
// pages/settings/screen-section.ts — Sleep: the delay with no input, the transition, sleep now
// ============================================================================

import { COLOR_TEXT_SECONDARY, SLEEP_DELAYS, SLEEP_FADES } from '../../constants';
import { Fonts } from '../../fonts';
import { DisplayObject } from '../../core/display';
import { screenPower } from '../../core/screen-power';
import { appState, setSleepDelay, setSleepFade } from '../../state';
import { BUTTON_PRIMARY, BUTTON_SECONDARY, drawButton } from '../../components/buttons';
import { drawLabel } from '../../components/primitives';
import { drawSectionHeading } from '../../components/rows';

const SECTION_PADDING = 24;
const BUTTON_GAP = 8;

export class ScreenSectionNode extends DisplayObject {
  constructor() {
    super('ScreenSection');
  }

  override onDraw(sectionWidth: number, sectionHeight: number): void {
    const x = SECTION_PADDING;
    const width = sectionWidth - SECTION_PADDING * 2;
    let cursorY = 20;
    drawSectionHeading(x, cursorY, 'Screen');
    cursorY += 52;

    drawLabel(Fonts.labelBold, x, cursorY, 'Turn off after', COLOR_TEXT_SECONDARY, width);
    cursorY += 28;
    let cursorX = x;
    for (let index = 0; index < SLEEP_DELAYS.length; index++) {
      const option = SLEEP_DELAYS[index];
      cursorX += BUTTON_GAP + drawButton('screen/delay/' + index, cursorX, cursorY, 0, option.label, '',
        appState.config.sleepDelaySeconds === option.seconds ? BUTTON_PRIMARY : BUTTON_SECONDARY, () => setSleepDelay(option.seconds));
    }
    cursorY += 72;

    drawLabel(Fonts.labelBold, x, cursorY, 'Transition', COLOR_TEXT_SECONDARY, width);
    cursorY += 28;
    cursorX = x;
    for (let index = 0; index < SLEEP_FADES.length; index++) {
      const option = SLEEP_FADES[index];
      cursorX += BUTTON_GAP + drawButton('screen/fade/' + index, cursorX, cursorY, 0, option.label, '',
        appState.config.sleepFadeSeconds === option.seconds ? BUTTON_PRIMARY : BUTTON_SECONDARY, () => setSleepFade(option.seconds));
    }
    cursorY += 72;

    drawButton('screen/sleep', x, cursorY, 0, 'Turn off now', 'moon', BUTTON_SECONDARY, () => screenPower.sleepNow());
    cursorY += 60;
    drawLabel(Fonts.small, x, cursorY, 'A touch, a key or the mouse wakes the screen and presses nothing.', COLOR_TEXT_SECONDARY, width);
  }
}
