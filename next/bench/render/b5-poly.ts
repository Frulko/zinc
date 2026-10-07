import { onFrame, clear, rect, rrect, border, shadow, clip, unclip, font, drawText, gradient, line, polygon } from 'zinc:gfx';
let seed = 12345;
function rnd(n: number): number { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; }
// B5: a polygon-heavy map: 600 blobs of 12 points and 400 lines
onFrame((dt: number) => {
  clear(0xe8efe4);
  for (let i = 0; i < 600; i++) {
    const cx = rnd(1000), cy = rnd(640), pts: number[] = [];
    for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6, r = 10 + rnd(14); { pts.push(cx + Math.cos(a) * r); pts.push(cy + Math.sin(a) * r); } }
    polygon(pts, 0x6aa84f + rnd(0x2000), 255);
  }
  for (let i = 0; i < 400; i++) line(rnd(1000), rnd(640), rnd(1000), rnd(640), 0x777777);
});
