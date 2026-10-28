import * as gfx from 'zinc:gfx';

const COLORS: u32[] = [0x38bdf8, 0xfb7185];
/** Contact IDs keep their marker number until lifted, independent of enumeration order. */
export class TouchOverlay {
  private ids: i32[] = [0, 0];
  private assigned: boolean[] = [false, false];
  draw(x: number, y: number, w: number, h: number, enabled: boolean): void {
    if (w <= 0 || h <= 0) return;
    const count = enabled ? gfx.touchCount() : 0;
    for (let slot = 0; slot < 2; slot++) {
      let found = false;
      for (let i = 0; i < count; i++) if (this.assigned[slot] && gfx.touchId(i) === this.ids[slot]) found = true;
      if (!found) this.assigned[slot] = false;
    }
    for (let i = 0; i < count; i++) {
      const id = gfx.touchId(i);
      if ((this.assigned[0] && this.ids[0] === id) || (this.assigned[1] && this.ids[1] === id)) continue;
      for (let slot = 0; slot < 2; slot++) if (!this.assigned[slot]) { this.ids[slot] = id; this.assigned[slot] = true; break; }
    }
    const px = x + 14, py = y + Math.max(8, h - 126);
    gfx.rrect(px, py, 190, 112, 10, 0x0f172a, 220);
    gfx.border(px, py, 190, 112, 10, 1, 0x64748b, 220);
    gfx.text(px + 8, py + 8, enabled ? `TRACKPAD  ${count} contacts` : 'TRACKPAD OFF - F7', 0xe2e8f0, 1);
    for (let slot = 0; slot < 2; slot++) for (let i = 0; i < count; i++) {
      if (!this.assigned[slot] || this.ids[slot] !== gfx.touchId(i)) continue;
      const tx = gfx.touchX(i), ty = gfx.touchY(i), color = COLORS[slot];
      const mx = px + 8 + Math.max(0, Math.min(1, tx / Math.max(1, gfx.width()))) * 174;
      const my = py + 28 + Math.max(0, Math.min(1, ty / Math.max(1, gfx.height()))) * 72;
      gfx.rrect(mx - 6, my - 6, 12, 12, 6, color, 255);
      gfx.text(mx + 8, my - 4, `${slot + 1}`, color, 1);
      if (tx < x || ty < y || tx >= x + w || ty >= y + h) continue;
      gfx.rrect(tx - 17, ty - 17, 34, 34, 17, color, 100);
      gfx.border(tx - 22, ty - 22, 44, 44, 22, 3, color, 255);
      gfx.line(tx - 9, ty, tx + 9, ty, 0xffffff);
      gfx.line(tx, ty - 9, tx, ty + 9, 0xffffff);
      gfx.text(tx + 26, ty - 5, `${slot + 1}`, color, 2);
    }
  }
}
