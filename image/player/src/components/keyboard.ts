// ============================================================================
// components/keyboard.ts — The on-screen keyboard (QWERTY or AZERTY)
// ============================================================================
// For a Pi with a touch screen and no keyboard: letters with a shift key, two pages of digits and symbols (a Wi-Fi
// password can hold any of them), backspace, space, a key that hides it and the form's own Enter. Its keys are left
// out of the keyboard focus: a computer keyboard types instead.

import { lineHeight, rrect } from 'zinc:gfx';
import {
  COLOR_ACCENT,
  COLOR_KEY,
  COLOR_KEY_PRESSED,
  COLOR_KEY_SPECIAL,
  COLOR_KEYBOARD,
  COLOR_TEXT_PRIMARY,
  KEY_GAP,
  KEY_HEIGHT,
  KEYBOARD_AZERTY,
  KEYBOARD_HEIGHT,
} from '../constants';
import { Fonts } from '../fonts';
import { isZonePressed, registerTapZone } from '../core/input';
import { drawCenteredText, drawGlyph } from './primitives';

const QWERTY_ROWS: string[] = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const AZERTY_ROWS: string[] = ['azertyuiop', 'qsdfghjklm', 'wxcvbn'];
const SYMBOL_ROWS: string[] = ['1234567890', '-/:;()$&@"', ".,?!'_%"];
const MORE_SYMBOL_ROWS: string[] = ['[]{}#^*+=~', '\\|<>€£¥•`', ".,?!'_%"];

/** The keys of one row, shifted to capitals when asked. */
function rowCharacters(layout: string, isShifted: boolean, isSymbols: boolean, rowIndex: i32): string {
  if (isSymbols) return isShifted ? MORE_SYMBOL_ROWS[rowIndex] : SYMBOL_ROWS[rowIndex];
  const row = layout === KEYBOARD_AZERTY ? AZERTY_ROWS[rowIndex] : QWERTY_ROWS[rowIndex];
  return isShifted ? row.toUpperCase() : row;
}

function drawKey(zoneId: string, x: number, y: number, width: number, color: u32, onTap: () => void): void {
  rrect(x, y, width, KEY_HEIGHT, 7, isZonePressed(zoneId) ? COLOR_KEY_PRESSED : color, 255);
  registerTapZone(zoneId, x, y, width, KEY_HEIGHT, onTap, false);
}

function drawTextKey(zoneId: string, x: number, y: number, width: number, label: string, fontId: i32, color: u32, onTap: () => void): void {
  drawKey(zoneId, x, y, width, color, onTap);
  drawCenteredText(fontId, x + width / 2, y + (KEY_HEIGHT - lineHeight(fontId)) / 2, label, COLOR_TEXT_PRIMARY);
}

function drawIconKey(zoneId: string, x: number, y: number, width: number, iconName: string, color: u32, onTap: () => void): void {
  drawKey(zoneId, x, y, width, color, onTap);
  drawGlyph(iconName, x + width / 2 - 12, y + KEY_HEIGHT / 2 - 12, 24, COLOR_TEXT_PRIMARY);
}

/**
 * Draws the keyboard in (`x`, `y`, `width`, KEYBOARD_HEIGHT). `onKey` gets a character, or 'back', 'shift', 'symbols',
 * 'hide', 'enter'.
 */
export function drawScreenKeyboard(
  x: number,
  y: number,
  width: number,
  layout: string,
  isShifted: boolean,
  isSymbols: boolean,
  enterLabel: string,
  onKey: (key: string) => void
): void {
  rrect(x, y, width, KEYBOARD_HEIGHT, 0, COLOR_KEYBOARD, 255);
  const keyWidth = (width - KEY_GAP * 11) / 10;
  const sideKeyWidth = keyWidth * 1.5;

  for (let rowIndex: i32 = 0; rowIndex < 3; rowIndex++) {
    const characters = rowCharacters(layout, isShifted, isSymbols, rowIndex);
    const keyY = y + KEY_GAP + rowIndex * (KEY_HEIGHT + KEY_GAP);
    const sideWidth = rowIndex === 2 ? (sideKeyWidth + KEY_GAP) * 2 : 0;
    const rowWidth = characters.length * keyWidth + (characters.length - 1) * KEY_GAP + sideWidth;
    let keyX = x + (width - rowWidth) / 2;
    if (rowIndex === 2) {
      if (isSymbols) {
        drawTextKey('key/shift', keyX, keyY, sideKeyWidth, isShifted ? '123' : '#+=', Fonts.labelBold, COLOR_KEY_SPECIAL, () => onKey('shift'));
      } else {
        drawIconKey('key/shift', keyX, keyY, sideKeyWidth, 'arrow-big-up', isShifted ? COLOR_KEY_PRESSED : COLOR_KEY_SPECIAL, () => onKey('shift'));
      }
      keyX += sideKeyWidth + KEY_GAP;
    }
    for (let index = 0; index < characters.length; index++) {
      const character = characters.charAt(index);
      drawTextKey('key/' + character, keyX, keyY, keyWidth, character, Fonts.keyboardKey, COLOR_KEY, () => onKey(character));
      keyX += keyWidth + KEY_GAP;
    }
    if (rowIndex === 2) drawIconKey('key/back', keyX, keyY, sideKeyWidth, 'delete', COLOR_KEY_SPECIAL, () => onKey('back'));
  }

  const bottomY = y + KEY_GAP + 3 * (KEY_HEIGHT + KEY_GAP);
  const wideKeyWidth = keyWidth * 2 + KEY_GAP;
  let keyX = x + KEY_GAP;
  drawTextKey('key/symbols', keyX, bottomY, wideKeyWidth, isSymbols ? 'ABC' : '123', Fonts.labelBold, COLOR_KEY_SPECIAL, () => onKey('symbols'));
  keyX += wideKeyWidth + KEY_GAP;
  drawIconKey('key/hide', keyX, bottomY, keyWidth, 'keyboard-off', COLOR_KEY_SPECIAL, () => onKey('hide'));
  keyX += keyWidth + KEY_GAP;
  const spaceWidth = width - (keyX - x) - wideKeyWidth - KEY_GAP * 2;
  drawTextKey('key/space', keyX, bottomY, spaceWidth, 'space', Fonts.label, COLOR_KEY, () => onKey(' '));
  keyX += spaceWidth + KEY_GAP;
  drawTextKey('key/enter', keyX, bottomY, wideKeyWidth, enterLabel, Fonts.labelBold, COLOR_ACCENT, () => onKey('enter'));
}
