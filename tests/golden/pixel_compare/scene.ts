import { onFrame, clear, rrect, border, shadow, rect } from 'zinc:gfx';
// the scene of tests/t1/pixel_compare.sh: rounded boxes with a border and a shadow on a flat ground; MOVE=1 shifts the second box by one pixel
onFrame((dt: number) => {
  clear(0xf4f4f5);
  rect(10, 10, 60, 40, 0x3366cc);
  shadow(90, 20, 80, 50, 12, 14, 0x000000, 90);
  rrect(90, 20, 80, 50, 12, 0xffffff, 255);
  border(90, 20, 80, 50, 12, 2, 0x222222, 255);
  rrect(190, 20, 80, 50, 16, 0x22aa66, 255);
});
