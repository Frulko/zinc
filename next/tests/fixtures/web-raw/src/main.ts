// zinc:gfx only, no zinc:ui tree: the semantic DOM has no node for it, so the web host gives it a window-sized canvas. A click turns the screen green (tests/t1/web_real.sh).
import { onFrame, clear, rect, width, height, pointerDown } from 'zinc:gfx';

let clicked = false;
onFrame((dt: number) => {
  if (pointerDown()) clicked = true;
  clear(clicked ? 0x00aa00 : 0x102030);
  rect(width() / 2 - 20, height() / 2 - 20, 40, 40, 0xffffff);
});
