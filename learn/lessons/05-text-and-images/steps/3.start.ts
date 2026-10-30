import { onFrame, clear, font, drawText, textWidth, image, drawImage, imageWidth, width, height } from 'zinc:gfx';

const title = font('sans-bold', 40);

onFrame((dt: number) => {
  clear(0x1c1b20);
  const w = textWidth(title, 'Hello, space', 0);
  drawText(title, (width() - w) / 2, 40, 'Hello, space', 0xeceaf0, 255, 0);
});
