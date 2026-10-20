// Shadows of every shape the mirrored rows and columns of ZN-589 meet: whole and half-pixel centres (mirrors), fractional ones (the key
// search), radii under half the blur (middle rows with different spans), boxes cut by the clip and the screen edges, tiny and huge blurs.
import { onFrame, clear, shadow, clip, unclip } from 'zinc:gfx';
let seed = 777;
function rnd(n: number): number { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; }
onFrame((dt: number) => {
  clear(0xf4f4f5);
  for (let i = 0; i < 300; i++) {
    const frac = i % 3 === 0 ? 0 : i % 3 === 1 ? 0.5 : rnd(97) / 97;
    const x = rnd(360) - 20 + frac, y = rnd(260) - 20 + (i % 2 === 0 ? frac : 0.25), w = 2 + rnd(120) + (i % 5 === 0 ? 0.5 : 0), h = 2 + rnd(90) + (i % 7 === 0 ? 0.37 : 0);
    const r = i % 4 === 0 ? 0 : rnd(30), blur = i % 9 === 0 ? 0.3 : 1 + rnd(40);
    if (i % 11 === 0) clip(40, 30, 200, 150, 0);
    shadow(x, y, w, h, r, blur, rnd(0xffffff), 30 + rnd(225));
    if (i % 11 === 0) unclip();
  }
});
