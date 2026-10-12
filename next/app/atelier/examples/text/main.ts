// Text: a font is a family and a size, asked once; drawText() places the top left of the words, textWidth() measures
// them, which is what centring and wrapping need.
import { onFrame, clear, rect, font, drawText, textWidth, lineHeight, width, height } from 'zinc:gfx';

const title = font('sans-bold', 44);
const body = font('sans', 18);
const small = font('sans-bold', 15);
const words = 'Words are placed one after the other, and go to the next line when the window ends.'.split(' ');

console.log(`the title is ${Math.round(textWidth(title, 'Text', 0))} pixels wide`);

onFrame((dt: number) => {
  clear(0xfffefc);
  // centred: half of what is left of the width
  drawText(title, (width() - textWidth(title, 'Text', 0)) / 2, 36, 'Text', 0x1d1b18, 255, 0);
  // wrapped by hand: measure each word, start a new line when it does not fit
  const left = 48, right = width() - 48, space = textWidth(body, ' ', 0);
  let x = left, y = 120;
  for (const w of words) {
    const wide = textWidth(body, w, 0);
    if (x + wide > right) { x = left; y += lineHeight(body); }
    drawText(body, x, y, w, 0x625d55, 255, 0);
    x += wide + space;
  }
  // underlined: a thin rectangle as wide as the words
  const s = 'measured, then underlined';
  drawText(small, left, y + 56, s, 0x5746e0, 255, 0);
  rect(left, y + 56 + lineHeight(small), textWidth(small, s, 0), 2, 0x5746e0);
});
