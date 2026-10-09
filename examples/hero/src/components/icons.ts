// Small line icons drawn with zinc:gfx strokes (no icon font needed), for a canvas of any size.
import { stroke, rrect } from 'zinc:gfx';

export const HOME_ICON: i32 = 0, GRID_ICON: i32 = 1, PLAY_ICON: i32 = 2, CHECK_ICON: i32 = 3, GEAR_ICON: i32 = 4,
  SEARCH_ICON: i32 = 5, BELL_ICON: i32 = 6, BACK_ICON: i32 = 7, PLUS_ICON: i32 = 8, CLOSE_ICON: i32 = 9, KIT_ICON: i32 = 10, FORMS_ICON: i32 = 11, VIDEO_ICON: i32 = 12, NAV_ICON: i32 = 13;

/** Draws icon `kind` centred in the box, with 1.6 px lines at 20 px (scaled with the box). */
export function drawIcon(kind: i32, x: number, y: number, w: number, h: number, color: u32): void {
  const s = Math.min(w, h), ox = x + (w - s) / 2, oy = y + (h - s) / 2;
  const lw = Math.max(1.2, s * 0.08);
  // points on a 0..20 grid
  const P = (pts: number[]): number[] => { const out: number[] = []; for (let i = 0; i < pts.length; i += 2) { out.push(ox + pts[i] * s / 20); out.push(oy + pts[i + 1] * s / 20); } return out; };
  const ring = (cx: number, cy: number, r: number): void => {
    const pts: number[] = [];
    for (let i = 0; i < 20; i++) { pts.push(cx + Math.cos(i * 0.31416) * r); pts.push(cy + Math.sin(i * 0.31416) * r); }
    stroke(P(pts), lw, color, 255, true);
  };
  if (kind === HOME_ICON) { stroke(P([3, 9, 10, 3, 17, 9]), lw, color, 255, false); stroke(P([5, 8, 5, 17, 15, 17, 15, 8]), lw, color, 255, false); }
  else if (kind === GRID_ICON) {
    for (let i = 0; i < 4; i++) { const gx = 3 + (i % 2) * 8, gy = 3 + Math.floor(i / 2) * 8; stroke(P([gx, gy, gx + 6, gy, gx + 6, gy + 6, gx, gy + 6]), lw, color, 255, true); }
  } else if (kind === PLAY_ICON) { ring(10, 10, 7.5); stroke(P([8.5, 7, 13, 10, 8.5, 13]), lw, color, 255, true); }
  else if (kind === CHECK_ICON) { stroke(P([3, 3, 17, 3, 17, 17, 3, 17]), lw, color, 255, true); stroke(P([6.5, 10, 9, 12.5, 14, 7.5]), lw, color, 255, false); }
  else if (kind === GEAR_ICON) {
    ring(10, 10, 3);
    for (let i = 0; i < 8; i++) { const a = i * 0.7854, c = Math.cos(a), sn = Math.sin(a); stroke(P([10 + c * 5.5, 10 + sn * 5.5, 10 + c * 8, 10 + sn * 8]), lw * 1.3, color, 255, false); }
    ring(10, 10, 5.5);
  } else if (kind === SEARCH_ICON) { ring(9, 9, 5.5); stroke(P([13, 13, 17, 17]), lw, color, 255, false); }
  else if (kind === BELL_ICON) { stroke(P([5, 14, 5, 9, 7, 5, 10, 4, 13, 5, 15, 9, 15, 14, 17, 15.5, 3, 15.5, 5, 14]), lw, color, 255, false); stroke(P([8.5, 17.5, 11.5, 17.5]), lw, color, 255, false); }
  else if (kind === BACK_ICON) { stroke(P([12, 4, 6, 10, 12, 16]), lw, color, 255, false); }
  else if (kind === PLUS_ICON) { stroke(P([10, 4, 10, 16]), lw, color, 255, false); stroke(P([4, 10, 16, 10]), lw, color, 255, false); }
  else if (kind === CLOSE_ICON) { stroke(P([5, 5, 15, 15]), lw, color, 255, false); stroke(P([15, 5, 5, 15]), lw, color, 255, false); }
  else if (kind === KIT_ICON) { stroke(P([3, 8, 10, 4, 17, 8, 10, 12, 3, 8]), lw, color, 255, false); stroke(P([3, 12, 10, 16, 17, 12]), lw, color, 255, false); }
  else if (kind === FORMS_ICON) { stroke(P([3, 3, 17, 3, 17, 17, 3, 17]), lw, color, 255, true); stroke(P([6, 7, 14, 7]), lw, color, 255, false); stroke(P([6, 10, 14, 10]), lw, color, 255, false); stroke(P([6, 13, 10, 13]), lw, color, 255, false); }
  else if (kind === VIDEO_ICON) { stroke(P([2, 4, 18, 4, 18, 16, 2, 16]), lw, color, 255, true); stroke(P([8.5, 7, 13, 10, 8.5, 13]), lw, color, 255, true); }
  else if (kind === NAV_ICON) { stroke(P([10, 18, 5, 10.5, 5, 7, 7, 4, 10, 3, 13, 4, 15, 7, 15, 10.5, 10, 18]), lw, color, 255, true); ring(10, 7.5, 2); }
  else rrect(ox + s * 0.3, oy + s * 0.3, s * 0.4, s * 0.4, s * 0.1, color, 255);
}
