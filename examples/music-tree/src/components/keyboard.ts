// ============================================================================
// components/keyboard.ts — Clavier virtuel AZERTY (style iPad sombre)
// ============================================================================
// Sur webOS 3 (HP TouchPad), les applications PDK n'ont pas accès au clavier
// système. Ce composant dessine un clavier AZERTY complet avec bascule
// lettres/chiffres (`123` / `ABC`), touche effacer et bouton `Rechercher`.

import { rrect, fontAscent } from 'zinc:gfx';
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

/**
 * Dessine le clavier virtuel dans le rectangle `(x, y, width, KEYBOARD_HEIGHT)`
 * et transmet chaque frappe à `onKeyPress`.
 */
export function drawVirtualKeyboard(
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

    // Touche Effacer (retour arrière) à la fin de la troisième rangée
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

  // Quatrième rangée : bascule 123/ABC, barre d'espace et bouton Rechercher
  const bottomRowY = y + keyGap + 3 * (keyHeight + keyGap);
  const sideButtonWidth = keyWidth * 2 + keyGap;

  // Bouton 123 / ABC
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

  // Barre d'espace
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

  // Bouton Rechercher (Entrée)
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
 * Nœud de l'arbre d'affichage représentant le clavier virtuel en bas de page.
 */
export class VirtualKeyboardNode extends DisplayObject {
  constructor() {
    super('VirtualKeyboard');
  }

  override onDraw(stageWidth: number, stageHeight: number): void {
    if (!appState.isKeyboardVisible) return;
    drawVirtualKeyboard(
      appState.sidebarWidth,
      stageHeight - KEYBOARD_HEIGHT,
      stageWidth - appState.sidebarWidth,
      handleTypedKeyboardKey
    );
  }
}
