// bouncing-ball: zinc:gfx only. Up/Down (or click) adds/removes balls. Zero heap allocation per frame
// once the balls exist; the HUD string is rebuilt only when its text changes.
import { onFrame, clear, rect, text, width, height, isDown, wasPressed, pointerDown, pointerX, pointerY, Btn } from 'zinc:gfx';

class Ball {
  x: number; y: number; vx: number; vy: number; size: number; color: u32;
  constructor(x: number, y: number) {
    this.x = x; this.y = y;
    const a = Math.random() * Math.PI * 2, speed = 60 + Math.random() * 120;
    this.vx = Math.cos(a) * speed; this.vy = Math.sin(a) * speed;
    this.size = 4 + Math.floor(Math.random() * 6);
    const palette: u32[] = [0xff5555, 0x55ff55, 0x5599ff, 0xffdd33, 0xff66cc, 0x33ffee];
    this.color = palette[Math.floor(Math.random() * palette.length)];
  }
  update(dt: number, w: number, h: number): void {
    this.vy += 240 * dt;  // gravity
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.x < 0) { this.x = 0; this.vx = -this.vx; }
    if (this.x + this.size > w) { this.x = w - this.size; this.vx = -this.vx; }
    if (this.y < 0) { this.y = 0; this.vy = -this.vy; }
    if (this.y + this.size > h) { this.y = h - this.size; this.vy = -this.vy * 0.98; if (Math.abs(this.vy) < 40) this.vy = -220; }
  }
}

const balls: Ball[] = [new Ball(width() / 2, 20)];
let hud = '';
let hudCount: i32 = -1;
let fps = 60, fpsAcc = 0, fpsFrames: i32 = 0;

function spawn(n: i32, x: number, y: number): void {
  for (let i = 0; i < n; i++) balls.push(new Ball(x, y));
}

onFrame((dt: number) => {
  const w = width(), h = height();
  if (wasPressed(Btn.Up) || wasPressed(Btn.A)) spawn(balls.length < 100 ? 99 : 100, w / 2, h / 3);
  if (wasPressed(Btn.Down) && balls.length > 1) balls.splice(1, balls.length - 1);
  if (pointerDown()) spawn(1, pointerX(), pointerY());
  for (const b of balls) b.update(dt, w, h);

  fpsAcc += dt; fpsFrames++;
  if (fpsAcc >= 0.5) { fps = fpsFrames / fpsAcc; fpsAcc = 0; fpsFrames = 0; hudCount = -1; }
  if (hudCount !== balls.length) {
    hudCount = balls.length;
    hud = `${balls.length} balls  ${Math.round(fps)} fps`;
  }

  clear(0x101820);
  for (const b of balls) rect(b.x, b.y, b.size, b.size, b.color);
  text(4, 4, hud, 0xffffff, 1);
  text(4, h - 12, 'UP/SPACE: +100  DOWN: reset  CLICK: +1', 0x8899aa, 1);
});

console.log('bouncing-ball: started with', balls.length, 'ball');
