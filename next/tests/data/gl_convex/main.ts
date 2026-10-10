// Convex polygons in one pass on the GPU (ZN-679): triangles, a card with a folded corner turned by setTransform, a regular octagon, translucent
// ones over each other, and a concave star and a nine-point polygon that keep the stencil path. tests/t1/gl_convex.sh compares the GL replay
// with the software frame.
import { onFrame, clear, polygon, setTransform, resetTransform, rrect } from 'zinc:gfx';

function card(cx: number, cy: number, w: number, h: number, angle: number, color: u32): void {
  const c = Math.cos(angle), s = Math.sin(angle), x = -w / 2, y = -h / 2, k = 18;
  setTransform(c, s, -s, c, cx, cy);
  polygon([x, y, x + w, y, x + w, y + h - k, x + w - k, y + h, x, y + h], color, 255);
  polygon([x + w - k, y + h, x + w, y + h - k, x + w - k, y + h - k], 0x1f2937, 46);
  resetTransform();
}
function ngon(cx: number, cy: number, r: number, n: i32, color: u32, alpha: i32): void {
  const p: number[] = [];
  for (let i: i32 = 0; i < n; i++) { const a = 2 * Math.PI * i / n + 0.2; p.push(cx + r * Math.cos(a)); p.push(cy + r * Math.sin(a)); }
  polygon(p, color, alpha);
}
onFrame((dt: number) => {
  clear(0xe7e1d6);
  polygon([20, 20, 110, 30, 40, 100], 0x2563eb, 255);
  polygon([130, 100, 200, 15, 215, 95], 0xdc2626, 180);
  card(90, 170, 120, 90, 0.35, 0xfffbf2);
  card(150, 190, 110, 80, -0.6, 0xfef3c7);
  ngon(265, 60, 42, 8, 0x16a34a, 255);
  ngon(285, 80, 36, 5, 0x9333ea, 140);
  ngon(265, 180, 40, 9, 0x0891b2, 255);   // nine points: the stencil path
  const star: number[] = [];
  for (let i: i32 = 0; i < 10; i++) { const r = i % 2 === 0 ? 36 : 15, a = Math.PI * i / 5; star.push(330 + r * Math.sin(a)); star.push(170 - r * Math.cos(a)); }
  polygon(star, 0xea580c, 255);   // concave: the stencil path
  rrect(10, 228, 360, 4, 2, 0x64748b, 255);
});
