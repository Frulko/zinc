// Emoji in text (tests/t0/emoji_text.sh): one line of Latin and colour emoji, drawn for three frames.
import { onFrame, clear, font, drawText, quit } from 'zinc:gfx';

const sans = font('sans', 20);
let n = 0;
onFrame(() => {
  clear(0x313338);
  drawText(sans, 8, 8, 'Hi \u{1F600} ok \u{1F44D}', 0xffffff, 255, 0);
  if (++n === 3) quit();
});
