// The readout over the city: frames a second, the mean time of render(), the triangles the levels chosen hold, who draws, the device's
// settings and Tokyo's hour; rebuilt twice a second (no string per frame). And the sources' credit line, which the data's terms ask for.
import { rrect, drawText, font, textWidth } from 'zinc:gfx';
import { clock } from 'zinc:sys';

const SMALL = font('sans', 10);
const BOLD = font('sans-bold', 11);

export class Hud {
  visible = true;
  private frames: i32 = 0;
  private elapsed = 0;
  private renderSum = 0;
  private since = -1;   // clock() at the last refresh: a console's dt is a fixed step, the wall clock says what the frames really took
  private text = '';
  private width = 0;

  frame(dt: number, ms: number, triangles: i32, gpu: boolean, device: string, hour: number, touring: boolean): void {
    this.elapsed += dt; this.frames++; this.renderSum += ms;
    if (this.elapsed < 0.5 && this.text.length > 0) return;
    const now = clock(), wall = this.since >= 0 ? (now - this.since) / 1000 : 0;
    this.since = now;
    const fps = this.frames / Math.max(wall > 0 ? wall : this.elapsed, 0.001), mean = this.renderSum / Math.max(this.frames, 1);
    const hh: i32 = Math.floor(hour), mm: i32 = Math.floor((hour - hh) * 60);
    this.text = `${Math.round(fps)} fps  ${mean.toFixed(1)} ms  ${triangles} tris  ${gpu ? 'GPU' : 'CPU'}  ${device}  ${hh}:${mm < 10 ? '0' : ''}${mm}  ${touring ? 'tour' : 'free'}`;
    this.width = textWidth(BOLD, this.text, 0) + 16;
    this.elapsed = 0; this.frames = 0; this.renderSum = 0;
  }

  draw(w: number, h: number, credit: string): void {
    if (!this.visible) return;
    rrect(6, 6, this.width, 20, 10, 0x0b0d14, 170);
    drawText(BOLD, 14, 10, this.text, 0xf4f4f5, 255, 0);
    const cw = textWidth(SMALL, credit, 0) + 12;
    rrect(w - cw - 4, h - 18, cw, 15, 7, 0x0b0d14, 140);
    drawText(SMALL, w - cw + 2, h - 16, credit, 0xd4d4d8, 255, 0);
  }
}
