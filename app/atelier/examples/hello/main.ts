// Hello: the smallest sketch. It prints a line in the console, then draws a word every frame.
import { onFrame, clear, font, drawText, textWidth, width, height } from 'zinc:gfx';

console.log('Hello from Zinc');

const big = font('sans-bold', 64);
onFrame((dt: number) => {
  clear(0xf3f1ec);
  const word = 'Hello';
  drawText(big, (width() - textWidth(big, word, 0)) / 2, height() / 2 - 40, word, 0x5746e0, 255, 0);
});
