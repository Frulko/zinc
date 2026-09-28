// scroll-text: smooth horizontal marquee for a WS2812 matrix (32x8 by default, 16x16 works too: the line is centred).
// macOS shows the matrix in an emulator window (display-ws2812); esp32 drives the LEDs on the configured pin.
// Left/Right change the speed, Space cycles the colour.
import { onFrame, clear, width, height, wasPressed, Btn } from 'zinc:gfx';
import { drawText, textWidth, fontHeight, FONT_5X7 } from 'zinc:pixelfont';

const TEXT = 'Hello from Zinc!  TypeScript on an ESP32 LED matrix  ';
const COLORS: u32[] = [0xff3020, 0xffa000, 0x30ff40, 0x20a0ff, 0xc040ff];
let speed = 14;  // pixels per second
let colorIndex: i32 = 0;
let scroll = 0;

const w = width(), h = height();
const textW = textWidth(TEXT, FONT_5X7);
const top = Math.floor((h - fontHeight(FONT_5X7)) / 2);

onFrame((dt: number) => {
  if (wasPressed(Btn.Right)) speed = Math.min(60, speed + 4);
  if (wasPressed(Btn.Left)) speed = Math.max(2, speed - 4);
  if (wasPressed(Btn.A)) colorIndex = (colorIndex + 1) % COLORS.length;
  scroll += speed * dt;
  if (scroll >= textW) scroll -= textW;
  const x = w - Math.floor(scroll);  // whole pixels: LEDs cannot show half a pixel
  clear(0x000000);
  // the text starts at the right edge; a second copy follows so the loop is seamless
  drawText(x - textW, top, TEXT, COLORS[colorIndex], FONT_5X7, 0, w);
  drawText(x, top, TEXT, COLORS[colorIndex], FONT_5X7, 0, w);
});
