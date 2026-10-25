import { onFrame, onResize, clear, rrect, pointerDown, pointerX } from 'zinc:gfx';
onResize((w: number, h: number) => {});
onFrame((dt: number) => {
  clear(0x123456);
  rrect(4, 4, 24, 24, 6, pointerDown() ? 0x00ff00 : 0xff0000, 128);
});
