// Heads-up display: ball count and frame rate. The text is rebuilt only when it changes, so a steady frame
// allocates nothing.
import { text, height } from 'zinc:gfx';

const HELP = 'UP/SPACE: +100  DOWN: reset  CLICK: +1';

export class Hud {
  private label = '';
  private shownCount: i32 = -1;
  private fps = 60;
  private elapsed = 0;       // seconds since the last fps sample
  private frames: i32 = 0;

  /** Counts a frame; the fps figure is refreshed twice a second. */
  tick(dt: number, ballCount: i32): void {
    this.elapsed += dt;
    this.frames++;
    if (this.elapsed >= 0.5) {
      this.fps = this.frames / this.elapsed;
      this.elapsed = 0;
      this.frames = 0;
      this.shownCount = -1;   // force a new label
    }
    if (this.shownCount !== ballCount) {
      this.shownCount = ballCount;
      this.label = `${ballCount} balls  ${Math.round(this.fps)} fps`;
    }
  }

  draw(): void {
    text(4, 4, this.label, 0xffffff, 1);
    text(4, height() - 12, HELP, 0x8899aa, 1);
  }
}
