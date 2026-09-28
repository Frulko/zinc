// Drawing the board on the LED matrix: one rect per run of equal colour (fewer draw calls on an ESP32),
// a blinking full row, and a global brightness used for the fade-out between rounds.
import { clear, rect } from 'zinc:gfx';
import { Board } from './board';

/** Scales a colour's channels by `k` (0..1). */
function dim(color: u32, k: number): u32 {
  const r = Math.floor(((color >> 16) & 255) * k);
  const g = Math.floor(((color >> 8) & 255) * k);
  const b = Math.floor((color & 255) * k);
  return (r << 16) | (g << 8) | b;
}

function drawRow(board: Board, y: i32, cell: i32, brightness: number): void {
  const blink = y === board.flashRow && Math.floor(board.flashTime * 12) % 2 === 0;
  let x: i32 = 0;
  while (x < board.cols) {
    const color = board.at(x, y);
    let end = x + 1;
    while (end < board.cols && board.at(end, y) === color) end++;
    if (color !== 0) rect(x * cell, y * cell, (end - x) * cell, cell, blink ? 0xffffff : dim(color, brightness));
    x = end;
  }
}

/** `cell`: LED pixels per board cell; `brightness`: 1 while playing, down to 0 during the fade-out. */
export function drawBoard(board: Board, cell: i32, brightness: number): void {
  clear(0x000000);
  for (let y: i32 = 0; y < board.rows; y++) drawRow(board, y, cell, brightness);
  for (const cube of board.falling) {
    if (cube.y > -1) rect(cube.x * cell, Math.floor(cube.y) * cell, cell, cell, dim(cube.color, brightness));
  }
}
