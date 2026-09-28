// falling-cubes: coloured cubes fall with gravity, slide off taller stacks like sand, full rows flash and clear
// (tetris-like); when a column overflows the board fades out and the game restarts. 1x1 cubes on 32x8, 2x2 on 16x16.
// Space drops a burst of cubes.
import { onFrame, clear, rect, width, height, wasPressed, Btn } from 'zinc:gfx';

class Cube {
  x: i32; y: number; vy: number; color: u32;
  constructor(x: i32, color: u32) { this.x = x; this.y = -1; this.vy = 0; this.color = color; }
}

const PALETTE: u32[] = [0xff2a2a, 0xff9a00, 0xffe600, 0x2aff4a, 0x00c8ff, 0x3a5aff, 0xc03aff];
const GRAVITY = 40;     // cells per second squared
const SPAWN_EVERY = 0.22;
const W = width(), H = height();
const CELL: i32 = W >= 16 && H >= 16 ? 2 : 1;
const COLS: i32 = Math.floor(W / CELL), ROWS: i32 = Math.floor(H / CELL);

const grid: u32[] = [];  // settled cubes, row-major, 0 = empty
for (let i: i32 = 0; i < COLS * ROWS; i++) grid.push(0);
const falling: Cube[] = [];
let spawnTimer = 0;
let flashRow: i32 = -1, flashTime = 0;  // a full row blinking before it clears
let fade = 1;                           // 1 = playing; < 1 = fading out before a restart
let fading = false;

function at(x: i32, y: i32): u32 { return grid[y * COLS + x]; }
/** Top free row of a column (-1 when full). */
function surface(x: i32): i32 {
  let y: i32 = ROWS - 1;
  while (y >= 0 && at(x, y) !== 0) y--;
  return y;
}

function spawn(): void {
  const x: i32 = Math.floor(Math.random() * COLS);
  if (surface(x) < 0) { fading = true; return; }  // column full: game over
  falling.push(new Cube(x, PALETTE[Math.floor(Math.random() * PALETTE.length)]));
}

/** Settle a landed cube: slide towards a lower neighbour column (sand), then fix it in the grid. */
function land(c: Cube): void {
  let x = c.x;
  for (let step: i32 = 0; step < COLS; step++) {
    const here = surface(x);
    const left: i32 = x > 0 ? surface(x - 1) : -1, right: i32 = x < COLS - 1 ? surface(x + 1) : -1;
    if (left > here + 1 && (right <= here + 1 || Math.random() < 0.5)) x--;
    else if (right > here + 1) x++;
    else break;
  }
  const y = surface(x);
  if (y < 0) { fading = true; return; }
  grid[y * COLS + x] = c.color;
  let full = true;
  for (let i: i32 = 0; i < COLS; i++) if (at(i, y) === 0) full = false;
  if (full && flashRow < 0) { flashRow = y; flashTime = 0.35; }
}

function clearRow(row: i32): void {
  for (let y = row; y > 0; y--) for (let x: i32 = 0; x < COLS; x++) grid[y * COLS + x] = grid[(y - 1) * COLS + x];
  for (let x: i32 = 0; x < COLS; x++) grid[x] = 0;
}

function dim(c: u32, k: number): u32 {
  const r = Math.floor(((c >> 16) & 255) * k), g = Math.floor(((c >> 8) & 255) * k), b = Math.floor((c & 255) * k);
  return (r << 16) | (g << 8) | b;
}

onFrame((dt: number) => {
  if (fading) {
    fade -= dt * 1.2;
    if (fade <= 0) {
      for (let i: i32 = 0; i < grid.length; i++) grid[i] = 0;
      falling.splice(0, falling.length);
      fading = false; fade = 1; flashRow = -1;
    }
  } else {
    spawnTimer -= dt;
    if (spawnTimer <= 0) { spawn(); spawnTimer = SPAWN_EVERY * (0.5 + Math.random()); }
    if (wasPressed(Btn.A)) for (let i: i32 = 0; i < 6; i++) spawn();
    for (let i = falling.length - 1; i >= 0; i--) {
      const c = falling[i];
      c.vy += GRAVITY * dt;
      c.y += c.vy * dt;
      const floor = surface(c.x);
      if (c.y >= floor) { falling.splice(i, 1); land(c); }
    }
    if (flashRow >= 0) {
      flashTime -= dt;
      if (flashTime <= 0) { clearRow(flashRow); flashRow = -1; }
    }
  }

  clear(0x000000);
  for (let y: i32 = 0; y < ROWS; y++) {
    const blink = y === flashRow && Math.floor(flashTime * 12) % 2 === 0;
    let x: i32 = 0;
    while (x < COLS) {  // one rect per run of equal colour
      const c = at(x, y);
      let e = x + 1;
      while (e < COLS && at(e, y) === c) e++;
      if (c !== 0) rect(x * CELL, y * CELL, (e - x) * CELL, CELL, blink ? 0xffffff : dim(c, fade));
      x = e;
    }
  }
  for (const c of falling) if (c.y > -1) rect(c.x * CELL, Math.floor(c.y) * CELL, CELL, CELL, dim(c.color, fade));
});
