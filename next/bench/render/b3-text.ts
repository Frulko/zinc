import { onFrame, clear, rect, rrect, border, shadow, clip, unclip, font, drawText, gradient, line, polygon } from 'zinc:gfx';
let seed = 12345;
function rnd(n: number): number { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; }
// B3: a wall of text, three sizes
const fonts = [font('sans', 12), font('sans', 16), font('sans-bold', 24)];
onFrame((dt: number) => {
  clear(0xffffff);
  for (let i = 0; i < 250; i++) drawText(fonts[i % 3], 8 + (i % 2) * 520, 4 + Math.floor(i / 2) * 26, 'The quick brown fox jumps over the lazy dog 0123456789', 0x111111, 255, 0);
});
