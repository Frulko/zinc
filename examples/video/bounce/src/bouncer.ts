// The bouncing box: position, direction and speed, reflected on the screen edges like the DVD logo.
// Pure logic (no drawing), so the rules are easy to read and to change.

/** Frame colours, one per bounce (Tailwind 500 shades). */
export const FRAME_COLORS: u32[] = [0x6366f1, 0x10b981, 0xf59e0b, 0xf43f5e, 0x0ea5e9, 0x8b5cf6];

export class Bouncer {
  x: number;
  y: number;
  speed: number;          // pixels per second along each axis
  corners: i32 = 0;       // bounces that hit two edges at once
  colorIndex: i32 = 0;    // index into FRAME_COLORS, advanced on every bounce
  private dx: number = 1;
  private dy: number = 1;

  constructor(x: number, y: number, speed: number) {
    this.x = x;
    this.y = y;
    this.speed = speed;
  }

  /** Moves the `w` x `h` box inside a `maxW` x `maxH` area, bouncing off its edges. */
  step(dt: number, w: number, h: number, maxW: number, maxH: number): void {
    this.x += this.dx * this.speed * dt;
    this.y += this.dy * this.speed * dt;
    let hits = 0;
    // a box past an edge is mirrored back inside, so fast boxes never stick to the border
    if (this.x < 0) { this.x = -this.x; this.dx = 1; hits++; }
    if (this.x > maxW - w) { this.x = 2 * (maxW - w) - this.x; this.dx = -1; hits++; }
    if (this.y < 0) { this.y = -this.y; this.dy = 1; hits++; }
    if (this.y > maxH - h) { this.y = 2 * (maxH - h) - this.y; this.dy = -1; hits++; }
    if (hits > 0) this.colorIndex = (this.colorIndex + 1) % FRAME_COLORS.length;
    if (hits > 1) this.corners++;
  }

  get color(): u32 { return FRAME_COLORS[this.colorIndex]; }
}
