// falling-cubes: coloured cubes rain on an LED matrix, pile up like sand, and full rows flash and clear. When a
// column overflows the board fades out and a new round starts. Space (pad A) drops a burst of cubes.
// Cells are 2x2 LEDs on a 16x16 panel and single LEDs on a 32x8 strip.
import { onFrame, width, height, wasPressed, Btn } from 'zinc:gfx';
import { Board } from './board';
import { drawBoard } from './render';

const SPAWN_EVERY = 0.22;   // mean seconds between two cubes
const BURST: i32 = 6;
const FADE_SPEED = 1.2;     // brightness lost per second when a round ends

const CELL: i32 = width() >= 16 && height() >= 16 ? 2 : 1;
const board = new Board(Math.floor(width() / CELL), Math.floor(height() / CELL));
let spawnTimer = 0;
let brightness = 1;

function play(dt: number): void {
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    board.spawn();
    spawnTimer = SPAWN_EVERY * (0.5 + Math.random());
  }
  if (wasPressed(Btn.A)) for (let i: i32 = 0; i < BURST; i++) board.spawn();
  board.update(dt);
}

/** Dims the board after an overflow, then starts a new round. */
function fadeOut(dt: number): void {
  brightness -= dt * FADE_SPEED;
  if (brightness <= 0) {
    board.reset();
    brightness = 1;
  }
}

onFrame((dt: number) => {
  if (board.overflowed) fadeOut(dt);
  else play(dt);
  drawBoard(board, CELL, brightness);
});
