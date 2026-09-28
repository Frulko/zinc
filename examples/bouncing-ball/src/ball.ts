// One ball: a coloured square with a velocity, pulled down by gravity and bouncing off the screen edges.

const GRAVITY = 240;           // px/s²
const FLOOR_DAMPING = 0.98;    // share of the speed kept after a floor bounce
const MIN_BOUNCE = 40;         // below this speed a ball is kicked up again, so the screen never settles
const KICK_SPEED = -220;
const COLORS: u32[] = [0xff5555, 0x55ff55, 0x5599ff, 0xffdd33, 0xff66cc, 0x33ffee];

function randomColor(): u32 {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

export class Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: u32;

  /** A ball at (x, y) thrown in a random direction at a random speed. */
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    const angle = Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 120;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.size = 4 + Math.floor(Math.random() * 6);
    this.color = randomColor();
  }

  /** Advances the ball by `dt` seconds inside a `width` x `height` box. */
  update(dt: number, width: number, height: number): void {
    this.vy += GRAVITY * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.bounceOnWalls(width);
    this.bounceOnCeilingAndFloor(height);
  }

  private bounceOnWalls(width: number): void {
    if (this.x < 0) {
      this.x = 0;
      this.vx = -this.vx;
    }
    if (this.x + this.size > width) {
      this.x = width - this.size;
      this.vx = -this.vx;
    }
  }

  private bounceOnCeilingAndFloor(height: number): void {
    if (this.y < 0) {
      this.y = 0;
      this.vy = -this.vy;
    }
    if (this.y + this.size > height) {
      this.y = height - this.size;
      this.vy = -this.vy * FLOOR_DAMPING;
      if (Math.abs(this.vy) < MIN_BOUNCE) this.vy = KICK_SPEED;
    }
  }
}
