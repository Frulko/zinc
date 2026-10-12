// Keys: two ways to read the keyboard. isDown() asks about the arrows and buttons that games use, every frame;
// the key events of the frame (keyCount, keyName) name any key as it goes down.
import { onFrame, clear, rrect, font, drawText, width, height, isDown, Btn, keyCount, keyKind, keyName, KeyKind } from 'zinc:gfx';

let x = 200, y = 150;
let last = 'press a key';
const label = font('sans', 20);
const SPEED = 260;   // pixels per second

onFrame((dt: number) => {
  if (isDown(Btn.Left)) x -= SPEED * dt;
  if (isDown(Btn.Right)) x += SPEED * dt;
  if (isDown(Btn.Up)) y -= SPEED * dt;
  if (isDown(Btn.Down)) y += SPEED * dt;
  x = Math.max(0, Math.min(width() - 48, x));
  y = Math.max(0, Math.min(height() - 48, y));

  for (let i = 0; i < keyCount(); i++) {
    if (keyKind(i) !== KeyKind.Down) continue;
    last = keyName(i);
    console.log('key ' + last);
  }

  clear(0x1c1b20);
  rrect(x, y, 48, 48, 12, 0xe8b06a, 255);
  drawText(label, 20, 16, last, 0xeceaf0, 255, 0);
});
