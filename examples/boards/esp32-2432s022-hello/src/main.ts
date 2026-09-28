// Screen check for the ESP32-2432S022: colour bars (red, green, blue, white, black), corner markers to see the
// orientation, "HELLO ZINC", and a square under your finger (touch). Expected on a correct panel: bars read
// red, green, blue, white, black from left to right; red marker top-left, green top-right, blue bottom-left,
// yellow bottom-right. Swapped red/blue -> madctl (BGR); negative colours -> invert; mirrored -> madctl.
import { onFrame, clear, rect, text, width, height, pointerDown, pointerX, pointerY } from 'zinc:gfx';

const BARS: u32[] = [0xff0000, 0x00ff00, 0x0000ff, 0xffffff, 0x000000];
let frames: i32 = 0;

onFrame((dt: number) => {
  const w = width(), h = height(), bar = w / BARS.length;
  clear(0x202020);
  for (let i = 0; i < BARS.length; i++) rect(i * bar, h * 0.3, bar, h * 0.25, BARS[i]);
  rect(0, 0, 24, 24, 0xff0000); rect(w - 24, 0, 24, 24, 0x00ff00);
  rect(0, h - 24, 24, 24, 0x0000ff); rect(w - 24, h - 24, 24, 24, 0xffff00);
  text(w / 2 - 66, h * 0.1, 'HELLO ZINC', 0xffffff, 2);
  text(20, h * 0.62, w + 'x' + h + ' frame ' + frames, 0x00ffff, 1);
  if (pointerDown()) rect(pointerX() - 10, pointerY() - 10, 20, 20, 0xff00ff);
  frames++;
});
