// gfx.gradientPaint against the chained two-stop rects (ZN-261): rows 0-127 a vertical three-stop paint (x 0-127) beside two stacked
// gradient() rects (x 128-255); rows 128-255 the same horizontally (the rects at x 128-191 and 192-255). On whole, power-of-two pixels the
// two are equal pixel for pixel (style_gradient.sh compares the halves). Then, at x 256: a ten-stop repeating paint (the GL replay draws more
// than eight stops from a CPU tile), an ellipse and a conic.
import { onFrame, clear, gradient, gradientPaint } from 'zinc:gfx';

const R: u32 = 0xef4444, G: u32 = 0x22c55e, B: u32 = 0x3b82f6;
const ten: number[] = [9, 256, 0, 0, 384, 128, 0, 10];
for (let i = 0; i < 10; i++) { ten.push(i / 9 * 0.5); ten.push(i % 2 === 0 ? 0x111827 : 0xf59e0b + i * 0x10); ten.push(255); }
onFrame((dt: number) => {
  clear(0xffffff);
  gradientPaint(0, 0, 128, 128, 0, [1, 0, 0, 0, 0, 128, 0, 3, 0, R, 255, 0.5, G, 255, 1, B, 255], 255);
  gradient(128, 0, 128, 64, 0, R, G, true, 255);
  gradient(128, 64, 128, 64, 0, G, B, true, 255);
  gradientPaint(0, 128, 128, 128, 0, [1, 0, 0, 0, 128, 0, 0, 3, 0, R, 255, 0.5, G, 255, 1, B, 255], 255);
  gradient(128, 128, 64, 128, 0, R, G, false, 255);
  gradient(192, 128, 64, 128, 0, G, B, false, 255);
  gradientPaint(256, 0, 128, 128, 12, ten, 255);
  gradientPaint(256, 128, 128, 64, 0, [3, 320, 160, 0, 64, 32, 0, 3, 0, 0xffffff, 255, 0.6, 0x2563eb, 255, 1, 0x1e3a8a, 128], 255);
  gradientPaint(256, 192, 128, 64, 32, [4, 320, 224, 0.5, 0, 0, 0, 3, 0, R, 255, 0.5, B, 255, 1, R, 255], 255);
  // records that do not hold what they claim draw nothing (the halves above stay equal): more stops than given, a kind out of range, NaN
  gradientPaint(0, 0, 64, 64, 0, [1, 0, 0, 0, 0, 64, 0, 5, 0, 0x000000, 255], 255);
  gradientPaint(0, 0, 64, 64, 0, [99, 0, 0, 0, 0, 64, 0, 1, 0, 0x000000, 255], 255);
  gradientPaint(0, 0, 64, 64, 0, [NaN, 0, 0, 0, 0, 64, 0, NaN, 0, 0x000000, 255], 255);
});
