import { onFrame, clear, rect, rrect, border, shadow, clip, unclip, font, drawText, gradient, line, polygon } from 'zinc:gfx';
let seed = 12345;
function rnd(n: number): number { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; }
// B1: 10k flat quads, half of them overlapping the previous ones
onFrame((dt: number) => {
  clear(0x101820);
  for (let i = 0; i < 10000; i++) rect(rnd(1000), rnd(640), 20 + rnd(40), 20 + rnd(40), 0x202020 + rnd(0xdfdfdf));
});
