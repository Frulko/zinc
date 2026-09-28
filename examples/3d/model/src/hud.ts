// Performance readout: frame rate and render time measurement, drawn as a light pill over the 3D view
// (white, hairline border, soft shadow: the zinc:ui/kit badge look).
import { shadow, rrect, border, drawText, font, textWidth } from 'zinc:gfx';

// The build bakes the Tailwind text sizes named in the sources (gfx.font picks the nearest baked one): text-xs.
const REGULAR = font('sans', 12);
const BOLD = font('sans-bold', 12);
const STRONG: u32 = 0x18181b;    // zinc-900
const MUTED: u32 = 0x71717a;     // zinc-500

/** Frames per second (counted over half a second) and a smoothed render time; logs the mean every 300 renders. */
export class FrameStats {
  fps: number = 0;
  renderMs: number = 0;
  private frames: i32 = 0;
  private elapsed: number = 0;
  private sum: number = 0;
  private samples: i32 = 0;
  private name: string;

  constructor(name: string) { this.name = name; }

  frame(dt: number): void {
    this.elapsed += dt;
    this.frames++;
    if (this.elapsed >= 0.5) { this.fps = this.frames / this.elapsed; this.elapsed = 0; this.frames = 0; }
  }

  /** One render took `ms` at `w` x `h`. */
  rendered(ms: number, w: i32, h: i32): void {
    this.renderMs = this.renderMs * 0.9 + ms * 0.1;
    this.sum += ms;
    this.samples++;
    if (this.samples === 300) {
      console.log(`${this.name} ${w}x${h}: ${(this.sum / this.samples).toFixed(2)} ms/render`);
      this.sum = 0;
      this.samples = 0;
    }
  }
}

export interface Reading { value: string; unit: string }

/** "60 fps  1.9 ms  698 tris": bold values, grey units, in a pill at (x, y). */
export function drawReadings(x: number, y: number, readings: Reading[]): void {
  let w = 20;
  for (const r of readings) w += textWidth(BOLD, r.value, 0) + textWidth(REGULAR, ` ${r.unit}`, 0) + 12;
  w -= 12;
  shadow(x, y + 1, w, 24, 12, 6, 0x000000, 60);
  rrect(x, y, w, 24, 12, 0xffffff, 240);
  border(x, y, w, 24, 12, 1, 0xe4e4e7, 255);
  let cx = x + 10;
  for (const r of readings) {
    drawText(BOLD, cx, y + 5, r.value, STRONG, 255, 0);
    cx += textWidth(BOLD, r.value, 0);
    drawText(REGULAR, cx, y + 5, ` ${r.unit}`, MUTED, 255, 0);
    cx += textWidth(REGULAR, ` ${r.unit}`, 0) + 12;
  }
}
