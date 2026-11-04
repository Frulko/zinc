import { onFrame, clear, clip, unclip, gradient, rrect, rect, border, setTransform, resetTransform, polygon } from 'zinc:gfx';

onFrame((dt: number): void => {
  clear(0xe2e8f0);
  for (let i: i32 = 0; i < 12; i++) {
    const x = 8.25 + (i % 4) * 98, y = 8.75 + Math.floor(i / 4) * 103;
    const r = 4 + i * 2.25;
    clip(x, y, 88, 92, r);
    gradient(x, y, 88, 92, 0, 0x0ea5e9, 0x7c3aed, true, 255);
    const a = (i % 3) * 0.15, c = Math.cos(a), s = Math.sin(a);
    setTransform(c, s, -s, c, x + 44 - c * 44 + s * 46, y + 46 - s * 44 - c * 46);
    rrect(0, 0, 88, 92, 12, 0xffffff, 100);
    border(0, 0, 88, 92, 12, 2, 0xff0000, 255);
    resetTransform();
    clip(x + 5.25, y + 5.25, 77.5, 81.5, 5.5);
    rrect(x - 4, y + 3, 54, 54, 27, 0x000000, 100);
    polygon([x, y + 80, x + 12, y + 50, x + 35, y + 64, x + 55, y + 42, x + 88, y + 80, x + 88, y + 92, x, y + 92], 0x1c1917, 70);
    unclip(); unclip();
  }
  // Unsupported mask radii retain the analytic path, rather than losing the clip.
  clip(0, 0, 400, 320, 156); rect(0, 0, 4, 4, 0xff0000); unclip();
});
