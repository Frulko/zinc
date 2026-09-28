// scroll-text: a smooth marquee on a WS2812 LED matrix (32x8 by default; 16x16 works, the line is centred).
// macOS shows the matrix in an emulator window; on an ESP32 the same code drives the LEDs on the configured pin.
// Left / Right change the speed, Space cycles the colour.
import { onFrame, clear, wasPressed, Btn } from 'zinc:gfx';
import { Marquee } from './marquee';

const marquee = new Marquee('Hello from Zinc!  TypeScript on an ESP32 LED matrix  ');

onFrame((dt: number) => {
  if (wasPressed(Btn.Right)) marquee.faster();
  if (wasPressed(Btn.Left)) marquee.slower();
  if (wasPressed(Btn.A)) marquee.nextColor();
  marquee.advance(dt);
  clear(0x000000);
  marquee.draw();
});
