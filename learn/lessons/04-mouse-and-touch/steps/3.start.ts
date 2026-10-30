import { onFrame, clear, rrect, pointerX, pointerY, pointerDown, wheel } from 'zinc:gfx';

let brush = 12;

onFrame((dt: number) => {
  clear(0xfffefc);
  if (pointerDown()) rrect(pointerX() - brush / 2, pointerY() - brush / 2, brush, brush, brush / 2, 0x5746e0, 255);
});
