import { onFrame, clear, rrect, pointerX, pointerY, pointerDown, wheel } from 'zinc:gfx';

let brush = 12;

onFrame((dt: number) => {
  clear(0xfffefc);
});
