import { Sprite, uiState, registerTapZone } from 'zinc:stage';
import { rrect, line, text } from 'zinc:gfx';
import { speed, paused, selected, select } from './state';
export class Observatory extends Sprite {
  phase: number = 0;
  chooseSun: () => void = () => { select(0); uiState.dirty = true; };
  chooseEarth: () => void = () => { select(1); uiState.dirty = true; };
  chooseMoon: () => void = () => { select(2); uiState.dirty = true; };
  override onUpdate(dt: number): void {
    if (!paused && speed > 0) { this.phase += dt * speed; uiState.dirty = true; }
  }
  override onDraw(w: number, h: number): void {
    const cx = w * 0.5, cy = h * 0.5;
    const ex = cx + Math.cos(this.phase) * w * 0.28;
    const ey = cy + Math.sin(this.phase) * h * 0.25;
    const mx = ex + Math.cos(this.phase * 3) * 42;
    const my = ey + Math.sin(this.phase * 3) * 42;
    text(24, 28, 'NATIVE OBSERVATORY', 0x9caac1, 2);
    text(24, h - 34, 'Click an object / Tab to select', 0x77869d, 1);
    line(cx, cy, ex, ey, 0x273b57); line(ex, ey, mx, my, 0x273b57);
    if (selected == 0) rrect(cx - 42, cy - 42, 84, 84, 42, 0xf4bb64, 70);
    if (selected == 1) rrect(ex - 30, ey - 30, 60, 60, 30, 0x6cb2ee, 70);
    if (selected == 2) rrect(mx - 20, my - 20, 40, 40, 20, 0xd0d9e6, 70);
    rrect(cx - 30, cy - 30, 60, 60, 30, 0xf4bb64, 255);
    rrect(ex - 20, ey - 20, 40, 40, 20, 0x6cb2ee, 255);
    rrect(mx - 11, my - 11, 22, 22, 11, 0xd0d9e6, 255);
    registerTapZone('sun', cx - 35, cy - 35, 70, 70, this.chooseSun);
    registerTapZone('earth', ex - 24, ey - 24, 48, 48, this.chooseEarth);
    registerTapZone('moon', mx - 16, my - 16, 32, 32, this.chooseMoon);
  }
}
