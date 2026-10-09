// Heads-up display: ball count and frame rate. The text is rebuilt only when it changes, so a steady frame
// allocates nothing.
import { text, height } from 'zinc:gfx';
import { clock } from 'zinc:sys';

const HELP = 'HOLD UP/SPACE: +100  DOWN: reset  CLICK: +1';

export class Hud {
  private label = '';
  private shownCount: i32 = -1;
  private fps = 60;
  private sampledAt = clock();
  private frames: i32 = 0;

  /** Counts a frame; the fps figure is refreshed twice a second. */
  tick(ballCount: i32): void {
    const now = clock();
    const elapsed = now - this.sampledAt;
    this.frames++;
    if (elapsed >= 500) {
      this.fps = this.frames * 1000 / elapsed;
      this.sampledAt = now;
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
