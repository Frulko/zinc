// Generative pictures for the gallery and the covers, drawn on canvases (zinc:gfx): no image files to ship, sharp at every size, deterministic for the
// goldens. A picture is a two-colour field, soft circles and a horizon, varied by its seed.
import { rrect, polygon, gradient } from 'zinc:gfx';

function hash(seed: number, k: number): number { let x = (seed * 374761393 + k * 668265263) % 2147483647; if (x < 0) x = -x; return (x % 10000) / 10000; }
export const SCENES: number[][] = [[0xFF7A59, 0x6D28D9], [0x0EA5E9, 0x0F766E], [0xF59E0B, 0xDC2626], [0x22C55E, 0x1E3A8A], [0xE879F9, 0x312E81], [0xFDE68A, 0xEA580C]];
export const TITLES: string[] = ['Coral dusk', 'Lagoon', 'Desert heat', 'Meadow night', 'Neon bay', 'Golden hour'];

const pts: number[] = [];   // reused: drawing a picture allocates nothing
export function picture(x: number, y: number, w: number, h: number, seed: number, radius: number): void {
  const c = SCENES[seed % SCENES.length];
  gradient(x, y, w, h, radius, c[0] as u32, c[1] as u32, true, 255);
  for (let i = 0; i < 5; i++) {
    const r = 10 + hash(seed, i) * w * 0.26, cx = x + hash(seed, i + 9) * w, cy = y + hash(seed, i + 17) * h * 0.75;
    if (cx - r > x && cx + r < x + w && cy - r > y) rrect(cx - r, cy - r, r * 2, r * 2, r, 0xFFFFFF, 20 + Math.round(hash(seed, i + 3) * 40));
  }
  const base = y + h * (0.62 + hash(seed, 31) * 0.15);
  pts.length = 0;
  pts.push(x); pts.push(y + h);
  for (let i = 0; i <= 8; i++) { pts.push(x + w * i / 8); pts.push(base - hash(seed, 40 + i) * h * 0.22); }
  pts.push(x + w); pts.push(y + h);
  polygon(pts, 0x1C1917, 70);
}
