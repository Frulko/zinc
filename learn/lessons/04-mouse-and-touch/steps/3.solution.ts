import { onFrame, clear, rrect, pointerX, pointerY, pointerDown, wheel } from 'zinc:gfx';

let brush = 12;

onFrame((dt: number) => {
  if (wheel() !== 0) brush = Math.max(2, Math.min(40, brush + wheel() * 2));
  clear(0xfffefc);
  if (pointerDown()) rrect(pointerX() - brush / 2, pointerY() - brush / 2, brush, brush, brush / 2, 0x5746e0, 255);
});
