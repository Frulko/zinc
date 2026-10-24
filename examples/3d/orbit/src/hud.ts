// The readout over the 3D view: frame rate, render time, triangles and who draws (GPU or CPU), refreshed twice a second so it builds no
// string per frame; and a line of help at the bottom. Light pills, the zinc:ui kit badge look.
import { shadow, rrect, border, drawText, font, textWidth } from 'zinc:gfx';

const REGULAR = font('sans', 12);
const BOLD = font('sans-bold', 12);
const STRONG: u32 = 0x18181b;

export class Hud {
  visible = true;
  private frames: i32 = 0;
  private elapsed = 0;
  private renderSum = 0;
  private text = '';
  private width = 0;

  /** One frame of `dt` seconds whose render took `ms` and drew `triangles`. */
  frame(dt: number, ms: number, triangles: i32, gpu: boolean, view: string): void {
    this.elapsed += dt; this.frames++; this.renderSum += ms;
    if (this.elapsed < 0.5 && this.text.length > 0) return;
    const fps = this.frames / Math.max(this.elapsed, 0.001), mean = this.renderSum / Math.max(this.frames, 1);
    this.text = `${Math.round(fps)} fps  ${mean.toFixed(1)} ms  ${triangles} tris  ${gpu ? 'GPU' : 'CPU'}  ${view}`;
    this.width = textWidth(BOLD, this.text, 0) + 20;
    this.elapsed = 0; this.frames = 0; this.renderSum = 0;
  }

  draw(w: number, h: number, help: string): void {
    if (!this.visible) return;
    shadow(8, 9, this.width, 24, 12, 6, 0x000000, 60);
    rrect(8, 8, this.width, 24, 12, 0xffffff, 235);
    border(8, 8, this.width, 24, 12, 1, 0xe4e4e7, 255);
    drawText(BOLD, 18, 13, this.text, STRONG, 255, 0);
    const hw = textWidth(REGULAR, help, 0) + 20;
    rrect((w - hw) / 2, h - 30, hw, 22, 11, 0x0b0d14, 170);
    drawText(REGULAR, (w - hw) / 2 + 10, h - 26, help, 0xd4d4d8, 255, 0);
  }
}
