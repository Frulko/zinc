// breakout: playable brick breaker on zinc:gfx.
// Keys: Left/Right or A/D (or mouse) to move, Space/Enter to serve, Esc to quit.
import { onFrame, clear, rect, text, width, height, isDown, wasPressed, pointerX, pointerDown, Btn } from 'zinc:gfx';

enum State { Title, Serve, Play, Over, Cleared }

class Brick {
  alive = true;
  constructor(public x: number, public y: number, public w: number, public h: number, public color: u32, public points: i32) {}
}

const W = width(), H = height();
const ROW_COLORS: u32[] = [0xff4d4d, 0xff9f43, 0xfeca57, 0x1dd1a1, 0x54a0ff, 0x9b59b6, 0xff6b9d, 0xc8d6e5];
const PADDLE_Y = H - 18;

let state = State.Title;
let bricks: Brick[] = [];
let level: i32 = 1, lives: i32 = 3, score: i32 = 0, best: i32 = 0;
let px = W / 2 - 24, pw = 48;
let bx = 0, by = 0, vx = 0, vy = 0, speed = 150;
let lastMouseX = -1;
let hud = '';
let hudKey = '';
let attract = false;  // demo mode: the paddle follows the ball
let idle = 0;

function buildLevel(n: i32): void {
  bricks = [];
  const rows: i32 = Math.min(3 + n, 8), cols: i32 = 10;
  const bw = (W - 20) / cols, bh = 10;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      bricks.push(new Brick(10 + c * bw + 1, 28 + r * (bh + 2), bw - 2, bh, ROW_COLORS[r % ROW_COLORS.length], (rows - r) * 10));
  speed = 150 + (n - 1) * 25;
  pw = Math.max(28, 52 - (n - 1) * 4);
}

function serve(): void {
  bx = px + pw / 2 - 2; by = PADDLE_Y - 6;
  const a = -Math.PI / 2 + (Math.random() - 0.5) * 0.8;
  vx = Math.cos(a) * speed; vy = Math.sin(a) * speed;
}

function newGame(): void {
  level = 1; lives = 3; score = 0;
  buildLevel(level);
  state = State.Serve;
}

function movePaddle(dt: number): void {
  if (attract) { px += Math.max(-300 * dt, Math.min(300 * dt, bx - (px + pw / 2 - 2))); px = Math.max(2, Math.min(W - pw - 2, px)); return; }
  const mx = pointerX();
  if (mx !== lastMouseX && lastMouseX >= 0) px = mx - pw / 2;
  lastMouseX = mx;
  if (isDown(Btn.Left)) px -= 260 * dt;
  if (isDown(Btn.Right)) px += 260 * dt;
  px = Math.max(2, Math.min(W - pw - 2, px));
}

function step(dt: number): void {
  bx += vx * dt; by += vy * dt;
  if (bx < 0) { bx = 0; vx = Math.abs(vx); }
  if (bx + 5 > W) { bx = W - 5; vx = -Math.abs(vx); }
  if (by < 16) { by = 16; vy = Math.abs(vy); }
  // paddle: bounce angle depends on the hit position
  if (vy > 0 && by + 5 >= PADDLE_Y && by + 5 <= PADDLE_Y + 8 && bx + 5 >= px && bx <= px + pw) {
    const t = (bx + 2.5 - (px + pw / 2)) / (pw / 2);
    const a = -Math.PI / 2 + t * 1.1;
    vx = Math.cos(a) * speed; vy = Math.sin(a) * speed;
    by = PADDLE_Y - 5;
  }
  for (const b of bricks) {
    if (!b.alive || bx + 5 < b.x || bx > b.x + b.w || by + 5 < b.y || by > b.y + b.h) continue;
    b.alive = false;
    score += b.points;
    speed += 1.5;
    const overlapX = Math.min(bx + 5 - b.x, b.x + b.w - bx), overlapY = Math.min(by + 5 - b.y, b.y + b.h - by);
    if (overlapX < overlapY) vx = -vx; else vy = -vy;
    break;
  }
  if (by > H) {
    lives--;
    state = lives > 0 ? State.Serve : State.Over;
    if (score > best) best = score;
  }
  if (bricks.every(b => !b.alive)) state = State.Cleared;
}

function centered(y: number, s: string, color: u32, scale: i32): void {
  text((W - s.length * 8 * scale) / 2, y, s, color, scale);
}

onFrame((dt: number) => {
  const go = wasPressed(Btn.A) || wasPressed(Btn.Start) || (pointerDown() && state !== State.Play);
  if (attract && (go || isDown(Btn.Left) || isDown(Btn.Right))) { attract = false; state = State.Title; idle = 0; }
  switch (state) {
    case State.Title:
      idle += dt;
      if (go) newGame();
      else if (idle > 2) { newGame(); attract = true; }
      break;
    case State.Serve: movePaddle(dt); bx = px + pw / 2 - 2; by = PADDLE_Y - 6; if (go || attract) { serve(); state = State.Play; } break;
    case State.Play: movePaddle(dt); step(dt); break;
    case State.Over: if (go || attract) { state = State.Title; idle = 0; attract = false; } break;
    case State.Cleared: if (go || attract) { level++; buildLevel(level); state = State.Serve; } break;
  }

  const key = `${score}/${lives}/${level}`;
  if (key !== hudKey) { hudKey = key; hud = `SCORE ${score}   LIVES ${lives}   LEVEL ${level}`; }

  clear(0x0b0e1a);
  rect(0, 14, W, 1, 0x2a3350);
  text(4, 4, hud, 0xe0e6ff, 1);
  if (state !== State.Title) {
    for (const b of bricks) if (b.alive) rect(b.x, b.y, b.w, b.h, b.color);
    rect(px, PADDLE_Y, pw, 5, 0xe0e6ff);
    rect(bx, by, 5, 5, 0xffffff);
  }
  if (state === State.Title) {
    centered(70, 'BREAKOUT', 0xfeca57, 3);
    centered(110, 'TypeScript -> C++ with Zinc', 0x8899cc, 1);
    centered(150, 'SPACE / ENTER / CLICK to start', 0xffffff, 1);
    centered(166, 'arrows, A/D or mouse to move', 0x8899cc, 1);
    if (best > 0) centered(190, `best ${best}`, 0x1dd1a1, 1);
  } else if (attract) {
    centered(H / 2, 'DEMO - press SPACE to play', 0xfeca57, 1);
  } else if (state === State.Serve) {
    centered(150, 'press SPACE to serve', 0xffffff, 1);
  } else if (state === State.Over) {
    centered(100, 'GAME OVER', 0xff4d4d, 3);
    centered(140, `final score ${score}`, 0xffffff, 1);
  } else if (state === State.Cleared) {
    centered(100, `LEVEL ${level} CLEARED`, 0x1dd1a1, 2);
    centered(140, 'press SPACE for the next level', 0xffffff, 1);
  }
});

buildLevel(1);
console.log('breakout ready:', bricks.length, 'bricks');
