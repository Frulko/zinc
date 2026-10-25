// What the 3DS demos (examples/n3ds-*) share: the stereoscopic top screen and the program's own time per frame.
// The top screen in 3D: while the program asks for it and the 3D slider is up, zinc:gfx calls the frame once per eye, the left eye first
// (zinc:hardware stereoEye). A thing at a depth is drawn shifted by that eye's share of its parallax: in front of the screen it moves right
// for the left eye and left for the right one, behind the screen the other way. The world moves on the left eye's frames only.
import { setStereo, stereoEye, stereoDepth } from 'zinc:hardware';
import { env, clock } from 'zinc:sys';

export class Eyes {
  eye: i32 = 0;      // 0 left (or no stereo), 1 right
  depth = 0;         // the 3D slider, 0 (flat or no 3D screen) to 1
  constructor() { setStereo(true); }
  /** Reads this frame's eye and the slider. */
  read(): void { this.eye = stereoEye(); this.depth = Math.max(0, stereoDepth()); }
  /** The left eye's frame (the one that moves the world); always true without stereo. */
  first(): boolean { return this.eye === 0; }
  /** How far a thing at depth `d` (pixels of parallax at full slider; > 0 in front of the screen) moves on this eye's picture. */
  shift(d: number): number { return Math.round((this.eye === 0 ? 0.5 : -0.5) * this.depth * d); }
}

/** The program's own time per refresh (both eyes and the bottom screen), when ZINC_PROFILE is set: its p50 and p99 every 240 refreshes on
 *  the log. ZINC_PROFILE's own `work` counts the bottom screen's wait for the GPU's last frame too (citro3d's frame start), this does not. */
export class ProgramTime {
  private on = env('ZINC_PROFILE') !== '';
  private spent = 0;
  private t0 = 0;
  private samples: number[] = [];
  private gaps: number[] = [];   // ms between refreshes: 16.7 at 60 Hz
  private last = 0;
  constructor(public name: string) {}
  begin(): void { if (this.on) this.t0 = clock(); }
  end(): void { if (this.on) this.spent += clock() - this.t0; }
  /** A new refresh starts: the last one's time is kept. */
  refresh(): void {
    if (!this.on) return;
    const now = clock();
    if (this.last > 0) { this.samples.push(this.spent); this.gaps.push(now - this.last); }
    this.last = now;
    this.spent = 0;
    if (this.samples.length < 240) return;
    this.samples.sort((a: number, b: number): number => a - b);
    this.gaps.sort((a: number, b: number): number => a - b);
    console.log(`${this.name}: program p50=${this.samples[120].toFixed(1)} p99=${this.samples[237].toFixed(1)} max=${this.samples[239].toFixed(1)} ms, refresh every p50=${this.gaps[120].toFixed(1)} p99=${this.gaps[237].toFixed(1)} ms`);
    this.samples.length = 0;
    this.gaps.length = 0;
  }
}
