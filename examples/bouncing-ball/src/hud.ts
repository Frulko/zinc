// Heads-up display: ball count and frame rate. The text is rebuilt only when it changes, so a steady frame
// allocates nothing.
import { text, height, signalCount, signalNext } from 'zinc:gfx';
import { clock } from 'zinc:sys';

const HELP = 'HOLD UP/SPACE: +100  DOWN: reset  CLICK: +1';

export class Hud {
  private label = '';
  private shownCount: i32 = -1;
  private fps = 60;
  private sampledAt = clock();
  private frames: i32 = 0;
  private top = 0;      // the safe area (a phone's notch or Dynamic Island, its home indicator): the system's 'safearea t r b l' signal
  private bottom = 0;
  private left = 0;

  /** Counts a frame; the fps figure is refreshed twice a second. */
  tick(ballCount: i32): void {
    for (let n = signalCount(); n > 0; n--) {
      const s = signalNext().split(' ');
      if (s[0] === 'safearea' && s.length === 5) { this.top = parseFloat(s[1]); this.bottom = parseFloat(s[3]); this.left = parseFloat(s[4]); }
    }
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
    text(this.left + 4, this.top + 4, this.label, 0xffffff, 1);
    text(this.left + 4, height() - this.bottom - 12, HELP, 0x8899aa, 1);
  }
}
