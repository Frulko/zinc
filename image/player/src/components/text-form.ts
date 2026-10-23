// ============================================================================
// components/text-form.ts — The form that asks for one value, over the page
// ============================================================================
// A card with a title, a field, its error and two buttons, above the on-screen keyboard; it takes every tap while it
// is open. A Wi-Fi password, the Wi-Fi country and the name on the network are typed here.

import { lineHeight, rect, rrect, shadow, textWidth } from 'zinc:gfx';
import {
  BUTTON_HEIGHT,
  COLOR_ACCENT,
  COLOR_CARD,
  COLOR_DANGER,
  COLOR_INSET,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  KEYBOARD_HEIGHT,
  TEXT_FORM_WIDTH,
} from '../constants';
import { Fonts } from '../fonts';
import { DisplayObject } from '../core/display';
import { registerTapZone } from '../core/input';
import { appState, closeForm, pressScreenKey, showScreenKeyboard, submitForm, toggleFormReveal } from '../state';
import { BUTTON_PRIMARY, BUTTON_SECONDARY, drawButton, drawIconButton, measureButton } from './buttons';
import { drawGlyph, drawLabel } from './primitives';
import { drawScreenKeyboard } from './keyboard';

const FORM_PADDING = 22;
const FIELD_HEIGHT = 48;
const FIELD_PADDING = 14;
const REVEAL_BUTTON_WIDTH = 44;

/** What the field shows: dots for a hidden secret, and the end of a value too long for it. */
function visibleFieldText(maxWidth: number): string {
  const form = appState.form;
  let shown = form.value;
  if (form.isSecret && !form.isRevealed) {
    shown = '';
    for (let index = 0; index < form.value.length; index++) shown += '•';
  }
  let start: i32 = 0;
  while (start < shown.length && textWidth(Fonts.body, shown.slice(start), 0) > maxWidth) start++;
  return shown.slice(start);
}

export class TextFormNode extends DisplayObject {
  constructor() {
    super('TextForm');
  }

  override onDraw(stageWidth: number, stageHeight: number): void {
    const form = appState.form;
    if (!form.isOpen) return;
    rrect(0, 0, stageWidth, stageHeight, 0, 0x000000, 150);
    registerTapZone('form/veil', 0, 0, stageWidth, stageHeight, () => {}, false);

    const isKeyboardShown = !appState.isScreenKeyboardHidden;
    const areaHeight = isKeyboardShown ? stageHeight - KEYBOARD_HEIGHT : stageHeight;
    const cardWidth = Math.min(TEXT_FORM_WIDTH, stageWidth - 32);
    const errorHeight = form.error === '' ? 0 : 26;
    const cardHeight = FORM_PADDING * 2 + 28 + 10 + 20 + 6 + FIELD_HEIGHT + errorHeight + 18 + BUTTON_HEIGHT;
    const cardX = Math.round((stageWidth - cardWidth) / 2);
    const cardY = Math.round(Math.max(12, (areaHeight - cardHeight) / 2));
    shadow(cardX, cardY + 8, cardWidth, cardHeight, 18, 30, 0x000000, 160);
    rrect(cardX, cardY, cardWidth, cardHeight, 18, COLOR_CARD, 255);

    const innerX = cardX + FORM_PADDING;
    const innerWidth = cardWidth - FORM_PADDING * 2;
    let cursorY = cardY + FORM_PADDING;
    drawLabel(Fonts.heading, innerX, cursorY, form.title, COLOR_TEXT_PRIMARY, innerWidth);
    cursorY += 28 + 10;
    drawLabel(Fonts.small, innerX, cursorY, form.label, COLOR_TEXT_SECONDARY, innerWidth);
    cursorY += 20 + 6;

    // The field: a tap on it brings the on-screen keyboard back
    rrect(innerX, cursorY, innerWidth, FIELD_HEIGHT, 10, COLOR_INSET, 255);
    rrect(innerX, cursorY + FIELD_HEIGHT - 2, innerWidth, 2, 0, COLOR_ACCENT, 255);
    const textRoom = innerWidth - FIELD_PADDING * 2 - (form.isSecret ? REVEAL_BUTTON_WIDTH : 0) - 4;
    const shown = visibleFieldText(textRoom);
    const textY = cursorY + (FIELD_HEIGHT - lineHeight(Fonts.body)) / 2;
    drawLabel(Fonts.body, innerX + FIELD_PADDING, textY, shown, COLOR_TEXT_PRIMARY, textRoom + 4);
    rect(innerX + FIELD_PADDING + textWidth(Fonts.body, shown, 0) + 1, textY + 2, 2, lineHeight(Fonts.body) - 4, COLOR_ACCENT);
    registerTapZone('form/field', innerX, cursorY, innerWidth - (form.isSecret ? REVEAL_BUTTON_WIDTH : 0), FIELD_HEIGHT, showScreenKeyboard, false);
    if (form.isSecret) {
      drawIconButton('form/reveal', form.isRevealed ? 'eye-off' : 'eye', innerX + innerWidth - REVEAL_BUTTON_WIDTH / 2 - 4,
        cursorY + FIELD_HEIGHT / 2, 20, COLOR_TEXT_SECONDARY, toggleFormReveal);
    }
    cursorY += FIELD_HEIGHT;

    if (form.error !== '') {
      drawGlyph('triangle-alert', innerX, cursorY + 8, 16, COLOR_DANGER);
      drawLabel(Fonts.small, innerX + 22, cursorY + 7, form.error, COLOR_DANGER, innerWidth - 22);
      cursorY += errorHeight;
    }
    cursorY += 18;

    const submitLabel = form.isBusy ? 'Please wait…' : form.submitLabel;
    const submitWidth = measureButton(submitLabel, '');
    drawButton('form/submit', innerX + innerWidth - submitWidth, cursorY, submitWidth, submitLabel, '', BUTTON_PRIMARY, submitForm, !form.isBusy);
    const cancelWidth = measureButton('Cancel', '');
    drawButton('form/cancel', innerX + innerWidth - submitWidth - 10 - cancelWidth, cursorY, cancelWidth, 'Cancel', '', BUTTON_SECONDARY, closeForm, !form.isBusy);

    if (isKeyboardShown) {
      drawScreenKeyboard(0, stageHeight - KEYBOARD_HEIGHT, stageWidth, appState.config.keyboardLayout, appState.isKeyboardShifted,
        appState.isKeyboardSymbols, form.submitLabel, pressScreenKey);
    }
  }
}
