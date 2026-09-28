// A looping marquee: the text enters at the right edge and a second copy follows it, so the loop is seamless.
// Positions snap to whole pixels: an LED cannot show half a pixel.
import { width, height } from 'zinc:gfx';
import { drawText, textWidth, fontHeight, FONT_5X7 } from 'zinc:pixelfont';

const COLORS: u32[] = [0xff3020, 0xffa000, 0x30ff40, 0x20a0ff, 0xc040ff];
const MIN_SPEED = 2, MAX_SPEED = 60, SPEED_STEP = 4;   // pixels per second

export class Marquee {
  speed = 14;
  private message: string;
  private messageWidth: number;
  private top: number;
  private offset = 0;           // pixels scrolled, 0..messageWidth
  private colorIndex: i32 = 0;

  constructor(message: string) {
    this.message = message;
    this.messageWidth = textWidth(message, FONT_5X7);
    this.top = Math.floor((height() - fontHeight(FONT_5X7)) / 2);   // vertically centred (16x16 panels too)
  }

  faster(): void { this.speed = Math.min(MAX_SPEED, this.speed + SPEED_STEP); }
  slower(): void { this.speed = Math.max(MIN_SPEED, this.speed - SPEED_STEP); }
  nextColor(): void { this.colorIndex = (this.colorIndex + 1) % COLORS.length; }

  advance(dt: number): void {
    this.offset += this.speed * dt;
    if (this.offset >= this.messageWidth) this.offset -= this.messageWidth;
  }

  draw(): void {
    const w = width();
    const x = w - Math.floor(this.offset);
    const color = COLORS[this.colorIndex];
    drawText(x - this.messageWidth, this.top, this.message, color, FONT_5X7, 0, w);
    drawText(x, this.top, this.message, color, FONT_5X7, 0, w);
  }
}
