// The touch screen, the lower half of the field: the stars arriving from the sky above (a mark at the top edge shows where the next ones
// will come in), the bounce lines, the line being drawn, the score. The stylus draws a line: press, drag, lift.
import { rect, rrect, text, drawImage, pointerDown, pointerX, pointerY } from 'zinc:gfx';
import { World, Phase, Line, STAR, SKY_H, R, LINE_LIFE, LINE_MIN, LINE_MAX } from './world';
import { sprite, backdrop } from './top';
import { BOTTOM_W, BOTTOM_H, DEEP, WHITE, DIM, CYAN, GOLD, RED } from './constants';

export class Pad {
  drawing = false;
  sx = 0; sy = 0; ex = 0; ey = 0;   // the line being drawn, in the screen's pixels
  tapped = false;                   // a touch began this frame
  private key = ''; private score = ''; private combo = '';
  private back = -1;

  /** Its backdrop, painted once (from the main window's frame: an image is not painted inside another window's). */
  prepare(): void { if (this.back < 0) this.back = backdrop(BOTTOM_W, BOTTOM_H, 0x0b1030, DEEP); }

  /** The stylus: a line from where it touched to where it lifts. */
  input(world: World): void {
    const d = pointerDown(), x = pointerX(), y = pointerY();
    this.tapped = d && !this.drawing;
    if (d && !this.drawing) { this.drawing = true; this.sx = x; this.sy = y; }
    if (d) { this.ex = x; this.ey = y; }
    if (!d && this.drawing) {
      this.drawing = false;
      world.addLine(this.sx, this.sy + SKY_H, this.ex, this.ey + SKY_H);
    }
  }

  draw(world: World): void {
    drawImage(this.back, 0, 0, BOTTOM_W, BOTTOM_H, 255, 0);
    rect(0, BOTTOM_H - 4, BOTTOM_W, 4, RED);   // the floor: what falls through is lost
    if (world.phase !== Phase.Play) { this.title(world); return; }
    const demo = world.demo;
    // where the next ones come in: the fallers in the lower part of the sky, marked at the top edge
    for (const f of world.fallers) {
      if (!f.alive || f.vy <= 0 || f.y < SKY_H - 100 || f.y > SKY_H - R) continue;
      rect(f.x - 4, 0, 8, 3, f.kind === STAR ? GOLD : RED);
    }
    for (const l of world.lines) if (l.alive) this.line(l);
    if (this.drawing) this.preview();
    for (const f of world.fallers) {
      if (!f.alive || f.y < SKY_H - R) continue;
      sprite(f.kind !== STAR, f.x, f.y - SKY_H, f.kind === STAR ? 2 * R + 4 : 2 * R, 255);
    }
    const key = `${world.score}/${world.combo}`;
    if (key !== this.key) { this.key = key; this.score = `${world.score}`; this.combo = world.combo > 1 ? `x${Math.min(world.combo, 5)}` : ''; }
    if (demo) { rrect(8, 8, BOTTOM_W - 16, BOTTOM_H - 20, 6, 0x000000, 140); this.title(world); return; }
    text(8, 8, this.score, WHITE, 2);
    if (this.combo !== '') text(BOTTOM_W - 40, 8, this.combo, GOLD, 2);
  }

  /** A bounce line: a row of dots, fading in its last second. */
  private line(l: Line): void {
    const a: i32 = Math.round(255 * Math.min(1, (LINE_LIFE - l.age) / 1));
    const n = Math.floor(l.len / 6);
    for (let k = 0; k <= n; k++) {
      const x = l.ax + (l.bx - l.ax) * k / n, y = l.ay + (l.by - l.ay) * k / n - SKY_H;
      rrect(Math.round(x) - 2, Math.round(y) - 2, 4, 4, 0, CYAN, a);
    }
  }

  private preview(): void {
    let dx = this.ex - this.sx, dy = this.ey - this.sy;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > LINE_MAX) { dx *= LINE_MAX / len; dy *= LINE_MAX / len; }
    const n = Math.max(1, Math.floor(Math.min(len, LINE_MAX) / 10));
    const color = len < LINE_MIN ? DIM : WHITE;
    for (let k = 0; k <= n; k++) rect(Math.round(this.sx + dx * k / n) - 1, Math.round(this.sy + dy * k / n) - 1, 2, 2, color);
  }

  private title(world: World): void {
    text(16, 20, 'STARFALL', GOLD, 3);
    text(16, 56, 'Stars fall from the sky above.', WHITE, 1);
    text(16, 70, 'Draw lines with the stylus:', WHITE, 1);
    text(16, 84, 'they throw the stars back up,', WHITE, 1);
    text(16, 98, 'into the constellation.', WHITE, 1);
    text(16, 120, 'Let the meteors through:', RED, 1);
    text(16, 134, 'one on a line costs a star.', RED, 1);
    text(16, 156, 'Two lines at a time: one star each.', DIM, 1);
    if (world.phase === Phase.Over) text(16, 178, `SCORE ${world.score}`, GOLD, 2);
    if (world.steps % 60 < 40) text(16, 210, 'TAP TO START', CYAN, 2);
  }
}
