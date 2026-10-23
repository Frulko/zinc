// ============================================================================
// pages/settings/preferences-section.ts — The home page's background and animation, the keyboard's letters
// ============================================================================

import { border, gradient } from 'zinc:gfx';
import {
  BACKGROUND_THEMES,
  COLOR_FOCUS_RING,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  KEYBOARD_AZERTY,
  KEYBOARD_QWERTY,
  ROW_HEIGHT,
} from '../../constants';
import { Fonts } from '../../fonts';
import { DisplayObject } from '../../core/display';
import { isZoneFocused, registerTapZone } from '../../core/input';
import { appState, setAnimationEnabled, setBackgroundTheme, setKeyboardLayout } from '../../state';
import { BUTTON_PRIMARY, BUTTON_SECONDARY, SWITCH_HEIGHT, SWITCH_WIDTH, drawButton, drawSwitch } from '../../components/buttons';
import { drawCenteredText, drawLabel } from '../../components/primitives';
import { drawSectionHeading, drawSettingRow } from '../../components/rows';

const SECTION_PADDING = 24;
const SWATCH_WIDTH = 92;
const SWATCH_HEIGHT = 58;
const SWATCH_GAP = 14;

export class PreferencesSectionNode extends DisplayObject {
  constructor() {
    super('PreferencesSection');
  }

  override onDraw(sectionWidth: number, sectionHeight: number): void {
    const x = SECTION_PADDING;
    const width = sectionWidth - SECTION_PADDING * 2;
    let cursorY = 20;
    drawSectionHeading(x, cursorY, 'Preferences');
    cursorY += 52;

    drawLabel(Fonts.labelBold, x, cursorY, 'Home page background', COLOR_TEXT_SECONDARY, width);
    cursorY += 28;
    for (let index = 0; index < BACKGROUND_THEMES.length; index++) {
      const theme = BACKGROUND_THEMES[index];
      const swatchX = x + index * (SWATCH_WIDTH + SWATCH_GAP);
      const zoneId = 'pref/theme/' + index;
      gradient(swatchX, cursorY, SWATCH_WIDTH, SWATCH_HEIGHT, 12, theme.topColor, theme.bottomColor, true, 255);
      if (appState.config.backgroundTheme === index) border(swatchX - 4, cursorY - 4, SWATCH_WIDTH + 8, SWATCH_HEIGHT + 8, 15, 3, COLOR_TEXT_PRIMARY, 255);
      else if (isZoneFocused(zoneId)) border(swatchX - 4, cursorY - 4, SWATCH_WIDTH + 8, SWATCH_HEIGHT + 8, 15, 2, COLOR_FOCUS_RING, 255);
      drawCenteredText(Fonts.small, swatchX + SWATCH_WIDTH / 2, cursorY + SWATCH_HEIGHT + 8, theme.name, COLOR_TEXT_SECONDARY);
      registerTapZone(zoneId, swatchX, cursorY, SWATCH_WIDTH, SWATCH_HEIGHT + 28, () => setBackgroundTheme(index));
    }
    cursorY += SWATCH_HEIGHT + 40;

    drawSettingRow('pref/animation-row', x, cursorY, width, 'Animation', 'Slow shapes behind the home page; off saves power on a Pi 3',
      SWITCH_WIDTH);
    drawSwitch('pref/animation', x + width - 16 - SWITCH_WIDTH, cursorY + (ROW_HEIGHT - SWITCH_HEIGHT) / 2, appState.config.animation,
      () => setAnimationEnabled(!appState.config.animation));
    cursorY += ROW_HEIGHT + 22;

    drawLabel(Fonts.labelBold, x, cursorY, 'On-screen keyboard', COLOR_TEXT_SECONDARY, width);
    cursorY += 28;
    const isAzerty = appState.config.keyboardLayout === KEYBOARD_AZERTY;
    const qwertyWidth = drawButton('pref/qwerty', x, cursorY, 0, 'QWERTY', '', isAzerty ? BUTTON_SECONDARY : BUTTON_PRIMARY,
      () => setKeyboardLayout(KEYBOARD_QWERTY));
    drawButton('pref/azerty', x + qwertyWidth + 10, cursorY, 0, 'AZERTY', '', isAzerty ? BUTTON_PRIMARY : BUTTON_SECONDARY,
      () => setKeyboardLayout(KEYBOARD_AZERTY));
  }
}
