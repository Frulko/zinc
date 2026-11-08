// @t atelier.first.import
import { onFrame, clear, rrect, pointerX, pointerY, pointerDown } from 'zinc:gfx';

// @t atelier.first.frame
onFrame((dt: number) => {
  // @t atelier.first.background
  clear(0x1c1b20);

  // @t atelier.first.size
  const r = pointerDown() ? 60 : 40;

  // @t atelier.first.circle
  rrect(pointerX() - r, pointerY() - r, r * 2, r * 2, r, 0x9388ff, 255);
});
