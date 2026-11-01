// tests/t1/live_idle.sh: draws once, then keeps that frame (an idle screen, like the Pi shell's home page).
import { onFrame, clear, rect, keep } from 'zinc:gfx';

let drawn = false;
onFrame((dt: number) => {
  if (drawn) { keep(); return; }
  drawn = true;
  clear(0x3366cc);
  rect(10, 10, 20, 20, 0xcc3333);
});
