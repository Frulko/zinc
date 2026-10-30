import { onFrame, clear, font, drawText, textWidth, image, drawImage, imageWidth, width, height } from 'zinc:gfx';

const title = font('sans-bold', 40);
const rocket = image('rocket.svg');   // the file assets/rocket.svg

onFrame((dt: number) => {
  clear(0x1c1b20);
  const size = imageWidth(rocket) * 2;
  drawImage(rocket, (width() - size) / 2, height() / 2 - size / 2, size, size, 255, 0);
  const w = textWidth(title, 'Hello, space', 0);
  drawText(title, (width() - w) / 2, 40, 'Hello, space', 0xeceaf0, 255, 0);
});
