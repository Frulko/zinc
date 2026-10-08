import { onFrame, clear, rect, text, width, height, isDown, Btn } from 'zinc:gfx';

let x = width() / 2, y = height() / 2;
onFrame((dt: number) => {
  if (isDown(Btn.Left)) x -= 120 * dt;
  if (isDown(Btn.Right)) x += 120 * dt;
  if (isDown(Btn.Up)) y -= 120 * dt;
  if (isDown(Btn.Down)) y += 120 * dt;
  clear(0x101820);
  rect(x - 8, y - 8, 16, 16, 0xfeca57);
  text(4, 4, 'arrows to move', 0xffffff, 1);
});
