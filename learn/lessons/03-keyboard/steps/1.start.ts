import { onFrame, clear, rrect, isDown, wasPressed, Btn } from 'zinc:gfx';

const SPEED = 240;   // pixels per second
const SIZE = 48;
let x = 100, y = 100;
let color: u32 = 0xe8b06a;

onFrame((dt: number) => {
  clear(0x1c1b20);
  rrect(x, y, SIZE, SIZE, 10, color, 255);
});
