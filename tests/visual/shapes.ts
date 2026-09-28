// Visual regression (zinc test --pixels): every zinc:gfx primitive, and a pentagon turned by the frame counter.
// zinc-test: frames 1,30
import { onFrame, clear, rect, rrect, gradient, border, shadow, polygon, path, stroke, line, font, drawText, text, clip, unclip, frame } from 'zinc:gfx';

const sans = font('sans', 13), bold = font('sans-bold', 18);
onFrame((dt: number) => {
  clear(0xf8fafc);
  shadow(16, 16, 120, 70, 10, 8, 0x0f172a, 60);
  rrect(16, 16, 120, 70, 10, 0xffffff, 255);
  border(16, 16, 120, 70, 10, 1, 0xcbd5e1, 255);
  drawText(bold, 26, 24, 'Zinc', 0x0f172a, 255, 0);
  drawText(sans, 26, 52, 'pixels, not flakes', 0x475569, 255, 0);
  gradient(152, 16, 152, 70, 12, 0x6366f1, 0xec4899, false, 255);
  rect(16, 100, 50, 50, 0xef4444);
  line(76, 100, 126, 150, 0x0f172a);
  gradient(140, 100, 60, 50, 0, 0x22c55e, 0x0ea5e9, true, 200);
  const a = frame() * 0.05;
  const pts: number[] = [];
  for (let i: i32 = 0; i < 5; i++) {
    const t = a + i * 1.2566;
    pts.push(262 + Math.cos(t) * 26);
    pts.push(125 + Math.sin(t) * 26);
  }
  polygon(pts, 0xf59e0b, 255);
  stroke([16, 200, 50, 170, 84, 205, 124, 175], 4, 0x8b5cf6, 255, false);
  clip(140, 165, 60, 50);
  rrect(120, 155, 100, 80, 20, 0x14b8a6, 255);
  unclip();
  // a ring: the inner contour runs the other way (nonzero winding)
  path([4, 215, 165, 305, 165, 305, 215, 215, 215, 4, 240, 175, 240, 205, 280, 205, 280, 175], 0x0f172a, 200);
  text(16, 222, 'grid 8px', 0x334155, 1);
});
