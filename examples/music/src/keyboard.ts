// An AZERTY keyboard drawn by the app (webOS 3 gives a PDK program no system keyboard), in the style of the iPad's dark one.
// A desktop's keyboard types into the same field (main.ts).
import { rrect, fontAscent } from 'zinc:gfx';
import { F, TEXT, ACCENT, centered, onTap, isPressed, glyph } from './ui';

const LETTERS = ['azertyuiop', 'qsdfghjklm', 'wxcvbné\'', ''];
const NUMBERS = ['1234567890', '-/:;()&@"', 'àçùè.,?!', ''];
let numbers = false;

export const KEYBOARD_H = 300;

/** Draws the keyboard in (x, y, w); `key` gets a character, 'back' or 'enter'. */
export function keyboard(x: number, y: number, w: number, key: (k: string) => void): void {
  rrect(x, y, w, KEYBOARD_H, 0, 0x1a1a1c, 255);
  const rows = numbers ? NUMBERS : LETTERS;
  const gap = 8, kh = 60, kw = (w - gap * 11) / 10;
  for (let r = 0; r < 3; r++) {
    const keys = rows[r];
    const rowW = keys.length * kw + (keys.length - 1) * gap + (r === 2 ? kw * 1.5 + gap : 0);
    let kx = x + (w - rowW) / 2;
    const ky = y + gap + r * (kh + gap);
    for (let i = 0; i < keys.length; i++) {
      const c = keys.charAt(i), id = 'key/' + c;
      rrect(kx, ky, kw, kh, 8, isPressed(id) ? 0x8e8e93 : 0x4a4a4e, 255);
      centered(F.key, kx + kw / 2, ky + (kh - fontAscent(F.key)) / 2 - 2, c, TEXT);
      onTap(id, kx, ky, kw, kh, () => key(c));
      kx += kw + gap;
    }
    if (r === 2) {   // erase at the end of the third row
      rrect(kx, ky, kw * 1.5, kh, 8, isPressed('key/back') ? 0x8e8e93 : 0x2c2c2e, 255);
      glyph('delete', kx + kw * 0.75 - 14, ky + kh / 2 - 14, 28, TEXT);
      onTap('key/back', kx, ky, kw * 1.5, kh, () => key('back'));
    }
  }
  const ky = y + gap + 3 * (kh + gap), side = kw * 2 + gap;
  rrect(x + gap, ky, side, kh, 8, isPressed('key/mode') ? 0x8e8e93 : 0x2c2c2e, 255);
  centered(F.bodyB, x + gap + side / 2, ky + (kh - fontAscent(F.bodyB)) / 2 - 1, numbers ? 'ABC' : '123', TEXT);
  onTap('key/mode', x + gap, ky, side, kh, () => { numbers = !numbers; });
  const sx = x + gap * 2 + side, sw = w - side * 2 - gap * 4;
  rrect(sx, ky, sw, kh, 8, isPressed('key/ ') ? 0x8e8e93 : 0x4a4a4e, 255);
  centered(F.label, sx + sw / 2, ky + (kh - fontAscent(F.label)) / 2 - 1, 'espace', TEXT);
  onTap('key/ ', sx, ky, sw, kh, () => key(' '));
  const ex = x + w - gap - side;
  rrect(ex, ky, side, kh, 8, isPressed('key/enter') ? 0xc81e3a : ACCENT, 255);
  centered(F.bodyB, ex + side / 2, ky + (kh - fontAscent(F.bodyB)) / 2 - 1, 'Rechercher', TEXT);
  onTap('key/enter', ex, ky, side, kh, () => key('enter'));
}
