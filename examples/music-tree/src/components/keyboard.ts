// ============================================================================
// components/keyboard.ts — AZERTY virtual keyboard (dark iPad style)
// ============================================================================
// On webOS 3 (HP TouchPad), PDK apps have no access to the system
// keyboard. This component draws a full AZERTY keyboard with a
// letters/digits toggle (`123` / `ABC`), a delete key and a `Rechercher` button.

import { rrect, fontAscent } from 'zinc:gfx';
import { platform } from 'zinc:sys';
import { isWebOS } from 'zinc:webos';
import {
  COLOR_ACCENT,
  COLOR_TEXT_PRIMARY,
  KEYBOARD_HEIGHT,
} from '../constants';
import { Fonts } from '../fonts';
import { DisplayObject } from '../core/display';
import { registerTapZone, isZonePressed } from '../core/input';
import { drawCenteredText, drawGlyph } from './primitives';
import { appState, handleTypedKeyboardKey } from '../state';

const LETTER_ROWS: string[] = ['azertyuiop', 'qsdfghjklm', "wxcvbné'", ''];
const NUMBER_ROWS: string[] = ['1234567890', '-/:;()&@"', 'àçùè.,?!', ''];

let isSymbolsModeActive: boolean = false;

/** The keyboard drawn on the screen is a tablet's (webOS, Android, iOS); a computer types with its own (main.ts reads its keys). */
export const hasTouchKeyboardOnly = isWebOS() || platform() === 'android' || platform() === 'ios';

/** The height the app's keyboard takes at the bottom of a page now: none while nobody types, none on a computer. */
export function getTouchKeyboardHeight(): number {
  return appState.isKeyboardVisible && hasTouchKeyboardOnly ? KEYBOARD_HEIGHT : 0;
}

/**
 * Draws the virtual keyboard in the rectangle `(x, y, width, KEYBOARD_HEIGHT)`
 * and passes each keystroke to `onKeyPress`.
 */
function drawVirtualKeyboard(
  x: number,
  y: number,
  width: number,
  onKeyPress: (keyToken: string) => void
): void {
  rrect(x, y, width, KEYBOARD_HEIGHT, 0, 0x1a1a1c, 255);

  const activeRows = isSymbolsModeActive ? NUMBER_ROWS : LETTER_ROWS;
  const keyGap = 8;
  const keyHeight = 60;
  const keyWidth = (width - keyGap * 11) / 10;

  for (let rowIndex = 0; rowIndex < 3; rowIndex++) {
    const rowCharacters = activeRows[rowIndex];
    const rowTotalWidth =
      rowCharacters.length * keyWidth +
      (rowCharacters.length - 1) * keyGap +
      (rowIndex === 2 ? keyWidth * 1.5 + keyGap : 0);
    let keyX = x + (width - rowTotalWidth) / 2;
    const keyY = y + keyGap + rowIndex * (keyHeight + keyGap);

    for (let charIndex = 0; charIndex < rowCharacters.length; charIndex++) {
      const character = rowCharacters.charAt(charIndex);
      const zoneId = 'key/' + character;

      rrect(
        keyX,
        keyY,
        keyWidth,
        keyHeight,
        8,
        isZonePressed(zoneId) ? 0x8e8e93 : 0x4a4a4e,
        255
      );
      drawCenteredText(
        Fonts.keyboardKey,
        keyX + keyWidth / 2,
        keyY + (keyHeight - fontAscent(Fonts.keyboardKey)) / 2 - 2,
        character,
        COLOR_TEXT_PRIMARY
      );
      registerTapZone(zoneId, keyX, keyY, keyWidth, keyHeight, () => onKeyPress(character));
      keyX += keyWidth + keyGap;
    }

    // Delete key (backspace) at the end of the third row
    if (rowIndex === 2) {
      const backspaceWidth = keyWidth * 1.5;
      rrect(
        keyX,
        keyY,
        backspaceWidth,
        keyHeight,
        8,
        isZonePressed('key/back') ? 0x8e8e93 : 0x2c2c2e,
        255
      );
      drawGlyph('delete', keyX + keyWidth * 0.75 - 14, keyY + keyHeight / 2 - 14, 28, COLOR_TEXT_PRIMARY);
      registerTapZone('key/back', keyX, keyY, backspaceWidth, keyHeight, () => onKeyPress('back'));
    }
  }

  // Fourth row: 123/ABC toggle, space bar and Rechercher button
  const bottomRowY = y + keyGap + 3 * (keyHeight + keyGap);
  const sideButtonWidth = keyWidth * 2 + keyGap;

  // 123 / ABC button
  rrect(
    x + keyGap,
    bottomRowY,
    sideButtonWidth,
    keyHeight,
    8,
    isZonePressed('key/mode') ? 0x8e8e93 : 0x2c2c2e,
    255
  );
  drawCenteredText(
    Fonts.bodyBold,
    x + keyGap + sideButtonWidth / 2,
    bottomRowY + (keyHeight - fontAscent(Fonts.bodyBold)) / 2 - 1,
    isSymbolsModeActive ? 'ABC' : '123',
    COLOR_TEXT_PRIMARY
  );
  registerTapZone('key/mode', x + keyGap, bottomRowY, sideButtonWidth, keyHeight, () => {
    isSymbolsModeActive = !isSymbolsModeActive;
  });

  // Space bar
  const spaceBarX = x + keyGap * 2 + sideButtonWidth;
  const spaceBarWidth = width - sideButtonWidth * 2 - keyGap * 4;
  rrect(
    spaceBarX,
    bottomRowY,
    spaceBarWidth,
    keyHeight,
    8,
    isZonePressed('key/ ') ? 0x8e8e93 : 0x4a4a4e,
    255
  );
  drawCenteredText(
    Fonts.label,
    spaceBarX + spaceBarWidth / 2,
    bottomRowY + (keyHeight - fontAscent(Fonts.label)) / 2 - 1,
    'espace',
    COLOR_TEXT_PRIMARY
  );
  registerTapZone('key/ ', spaceBarX, bottomRowY, spaceBarWidth, keyHeight, () => onKeyPress(' '));

  // Rechercher button (Enter)
  const enterButtonX = x + width - keyGap - sideButtonWidth;
  rrect(
    enterButtonX,
    bottomRowY,
    sideButtonWidth,
    keyHeight,
    8,
    isZonePressed('key/enter') ? 0xc81e3a : COLOR_ACCENT,
    255
  );
  drawCenteredText(
    Fonts.bodyBold,
    enterButtonX + sideButtonWidth / 2,
    bottomRowY + (keyHeight - fontAscent(Fonts.bodyBold)) / 2 - 1,
    'Rechercher',
    COLOR_TEXT_PRIMARY
  );
  registerTapZone('key/enter', enterButtonX, bottomRowY, sideButtonWidth, keyHeight, () =>
    onKeyPress('enter')
  );
}

/**
 * Display tree node for the virtual keyboard at the bottom of the page.
 */
export class VirtualKeyboardNode extends DisplayObject {
  constructor() {
    super('VirtualKeyboard');
  }

  override onDraw(stageWidth: number, stageHeight: number): void {
    if (getTouchKeyboardHeight() === 0) return;
    drawVirtualKeyboard(
      appState.sidebarWidth,
      stageHeight - KEYBOARD_HEIGHT,
      stageWidth - appState.sidebarWidth,
      handleTypedKeyboardKey
    );
  }
}
