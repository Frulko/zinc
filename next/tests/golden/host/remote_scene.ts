// A still scene for the remote display pair test (tests/t1/display_drivers.sh): the same pixels whatever the frame count or the clock.
import { onFrame, clear, rect, rrect, gradient, border, font, drawText, line, polygon } from 'zinc:gfx';

const sans = font('sans', 13), bold = font('sans-bold', 18);
onFrame((dt: number) => {
  clear(0xf8fafc);
  rrect(16, 16, 140, 70, 10, 0xffffff, 255);
  border(16, 16, 140, 70, 10, 1, 0xcbd5e1, 255);
  drawText(bold, 26, 24, 'remote', 0x0f172a, 255, 0);
  drawText(sans, 26, 52, 'one pixel, two ends', 0x475569, 255, 0);
  gradient(172, 16, 132, 70, 12, 0x6366f1, 0xec4899, false, 255);
  rect(16, 100, 60, 50, 0xef4444);
  line(90, 100, 140, 150, 0x0f172a);
  polygon([220, 100, 260, 150, 180, 150], 0xf59e0b, 255);
  rrect(16, 170, 288, 50, 16, 0x14b8a6, 200);
});
