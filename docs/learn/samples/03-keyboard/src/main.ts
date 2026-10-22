import { onFrame, clear, rrect, font, drawText, width, height, isDown, wasPressed, Btn, keyCount, keyKind, keyName, KeyKind } from 'zinc:gfx';

const SPEED = 240;   // pixels per second
const SIZE = 48;
let x = 100, y = 100;
let color: u32 = 0xe8b06a;
let lastKey = 'Press a key';
const label = font('sans', 24);

onFrame((dt: number) => {
  // 1. Keys held down: ask every frame.
  if (isDown(Btn.Left)) x -= SPEED * dt;
  if (isDown(Btn.Right)) x += SPEED * dt;
  if (isDown(Btn.Up)) y -= SPEED * dt;
  if (isDown(Btn.Down)) y += SPEED * dt;
  x = Math.max(0, Math.min(width() - SIZE, x));
  y = Math.max(0, Math.min(height() - SIZE, y));

  // 2. A key pressed this frame (not held since before).
  if (wasPressed(Btn.A)) color = color === 0xe8b06a ? 0x5bc0eb : 0xe8b06a;

  // 3. Every key that went down since the last frame, by name.
  for (let i = 0; i < keyCount(); i++) {
    if (keyKind(i) === KeyKind.Down) {
      lastKey = keyName(i) === ' ' ? 'Space' : keyName(i);
      console.log(`key "${lastKey}", the square is at x = ${Math.round(x)}`);
    }
  }

  clear(0x1c1b20);
  rrect(x, y, SIZE, SIZE, 10, color, 255);
  drawText(label, 20, 16, lastKey, 0xeceaf0, 255, 0);
});
