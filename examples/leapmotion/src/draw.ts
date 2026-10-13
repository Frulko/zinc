import { polygon, stroke, rrect, drawText, font } from 'zinc:gfx';
import { Fruit, COLORS } from './model';
export const BG: u32 = 0x101719, PANEL: u32 = 0x182224, MUTED: u32 = 0x8faaa5, WHITE: u32 = 0xeff8ed, LIME: u32 = 0xd3f78a, CYAN: u32 = 0x74e4de;
const regular = font('sans', 16), small = font('sans', 12), heading = font('sans-bold', 32), huge = font('sans-bold', 64), medium = font('sans-bold', 20);
export function label(x: number, y: number, s: string, color: u32 = WHITE, size: number = 16, alpha: number = 255): void {
  drawText(size === 12 ? small : size === 32 ? heading : size === 64 ? huge : size === 20 ? medium : regular, x, y, s, color, Math.round(alpha), 0);
}
export function disc(x: number, y: number, r: number, color: u32, alpha: number = 255): void { rrect(x - r, y - r, r * 2, r * 2, r, color, Math.round(alpha)); }
export function ring(x: number, y: number, r: number, color: u32, alpha: number = 255, start: number = 0, end: number = Math.PI * 2): void {
  const pts: number[] = [];
  for (let i = 0; i <= 32; i++) { const a = start + (end - start) * i / 32; pts.push(x + Math.cos(a) * r); pts.push(y + Math.sin(a) * r); }
  stroke(pts, 1.5, color, Math.round(alpha), false);
}
export function segment(ax: number, ay: number, bx: number, by: number, w: number, color: u32, alpha: number = 255): void {
  stroke([ax, ay, bx, by], w, color, Math.round(alpha), false);
}
function fruitPart(f: Fruit, half: number): void {
  const r = f.r, a = f.angle + half * f.split * 1.8;
  const x = f.x + half * f.split * 95, y = f.y + f.split * f.split * 110;
  const col: u32 = f.kind === 4 ? 0x344447 : COLORS[f.kind];
  if (half === 0) disc(x, y, r, col);
  else {
    const pts: number[] = [];
    for (let i = 0; i <= 20; i++) {
      const t = (half < 0 ? Math.PI / 2 : -Math.PI / 2) + i * Math.PI / 20;
      pts.push(x + Math.cos(t + a) * r); pts.push(y + Math.sin(t + a) * r);
    }
    polygon(pts, col, Math.round(255 * (1 - f.split * 0.7)));
    segment(x + Math.cos(a + Math.PI / 2) * r, y + Math.sin(a + Math.PI / 2) * r,
      x - Math.cos(a + Math.PI / 2) * r, y - Math.sin(a + Math.PI / 2) * r, 4, 0xffedcc, 210);
  }
  if (half !== 0) return;
  if (f.kind === 4) {
    ring(x, y, r - 5, 0x738b8e, 200);
    segment(x - 7, y - 7, x + 7, y + 7, 3, WHITE); segment(x + 7, y - 7, x - 7, y + 7, 3, WHITE);
    segment(x, y - r, x + 7, y - r - 14, 3, MUTED); disc(x + 8, y - r - 15, 4, LIME);
  } else {
    disc(x - r * 0.3, y - r * 0.32, r * 0.23, 0xffffff, 95);
    segment(x, y - r + 4, x + 4, y - r - 8, 3, 0x6b8052);
    polygon([x + 2, y - r - 3, x + 18, y - r - 12, x + 16, y - r + 1], 0x83c66e, 255);
    if (f.kind === 2) for (let i = -1; i <= 1; i++) ring(x + i * 8, y + 5, r * 0.5, 0x46985c, 90, -1, 1);
    if (f.kind === 1) ring(x, y, r - 6, 0xffeb8a, 140, 0.5, 2.3);
  }
}
export function fruit(f: Fruit): void { if (f.cut) { fruitPart(f, -1); fruitPart(f, 1); } else fruitPart(f, 0); }
