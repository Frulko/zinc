// text-scroller: a colour marquee on the 8x8 matrix. Messages scroll right to left one after the other; shaking the
// board skips to the next one. The 3x5 font leaves room for a thin colour bar under the text.
// On the Mac: Left/Right change the speed, Space shakes the emulated board.
import { onFrame, clear, rect, width, height, wasPressed, Btn } from 'zinc:gfx';
import { drawText, textWidth, fontHeight, FONT_3X5 } from 'zinc:pixelfont';
import * as imu from 'zinc:imu';
import { MESSAGES } from './messages';

const W = width(), H = height();
let speed = 10;       // columns per second (a slow marquee is easier to read on 8 columns)
let index: i32 = 0;   // current message
let scroll = 0;       // pixels scrolled since the message entered on the right
let hue = 0;          // rainbow phase, turns slowly

/** Saturated colour around the colour wheel, h in 0..1 (wraps). */
function rainbow(h: number): u32 {
  const k = (n: number): number => {
    const t = (n + (h - Math.floor(h)) * 6) % 6;
    return Math.max(0, Math.min(1, Math.min(t, 4 - t)));
  };
  return (Math.round(k(5) * 255) << 16) | (Math.round(k(3) * 255) << 8) | Math.round(k(1) * 255);
}

function next(): void {
  index = (index + 1) % MESSAGES.length;
  scroll = 0;
}

onFrame((dt: number) => {
  imu.update(dt);
  if (imu.shaken()) next();
  if (wasPressed(Btn.Right)) speed = Math.min(40, speed + 3);
  if (wasPressed(Btn.Left)) speed = Math.max(3, speed - 3);

  const m = MESSAGES[index];
  const total = textWidth(m.text, m.font);
  scroll += speed * dt;
  hue += dt * 0.15;
  if (scroll > W + total) next();  // fully gone on the left: next message

  const x0 = W - Math.floor(scroll);  // whole pixels: an LED cannot be half lit in a useful way
  const top = m.font === FONT_3X5 ? 1 : Math.floor((H - fontHeight(m.font)) / 2);
  clear(0x000000);
  if (m.rainbow) {
    // one letter at a time, each in the next colour
    let x = x0;
    for (let i: i32 = 0; i < m.text.length; i++) {
      const ch = m.text.substring(i, i + 1);
      const w = textWidth(ch, m.font);
      if (x + w > 0 && x < W) drawText(x, top, ch, rainbow(hue + i * 0.09), m.font, 0, W);
      x += w;
    }
  } else {
    drawText(x0, top, m.text, m.color, m.font, 0, W);
  }
  if (m.font === FONT_3X5)  // a moving rainbow bar under the small font
    for (let x: i32 = 0; x < W; x++) rect(x, H - 1, 1, 1, rainbow(hue + x / W));
});
