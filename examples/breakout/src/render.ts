// Drawing: the HUD line, the wall, the paddle and the ball, and the centred messages of each phase.
// Text uses the built-in 8x8 pixel font (`text`), which exists on every target down to the PS1.
import { clear, rect, text, width, height } from 'zinc:gfx';
import { Game, Phase, BALL_SIZE, PADDLE_HEIGHT, PADDLE_Y } from './game/game';

const BACKGROUND: u32 = 0x0b0e1a;
const RULE: u32 = 0x2a3350;
const INK: u32 = 0xe0e6ff;
const DIM: u32 = 0x8899cc;
const YELLOW: u32 = 0xfeca57;
const GREEN: u32 = 0x1dd1a1;
const RED: u32 = 0xff4d4d;
const WHITE: u32 = 0xffffff;

// the HUD string is rebuilt only when one of its numbers changes
let hudText = '';
let hudKey = '';

function hud(game: Game): string {
  const key = `${game.score}/${game.lives}/${game.level}`;
  if (key !== hudKey) {
    hudKey = key;
    hudText = `SCORE ${game.score}   LIVES ${game.lives}   LEVEL ${game.level}`;
  }
  return hudText;
}

/** Text centred horizontally; `scale` multiplies the 8 px glyphs. */
function centered(y: number, s: string, color: u32, scale: i32): void {
  text((width() - s.length * 8 * scale) / 2, y, s, color, scale);
}

function drawField(game: Game): void {
  for (const brick of game.bricks) if (brick.alive) rect(brick.x, brick.y, brick.w, brick.h, brick.color);
  rect(game.paddleX, PADDLE_Y, game.paddleWidth, PADDLE_HEIGHT, INK);
  rect(game.ballX, game.ballY, BALL_SIZE, BALL_SIZE, WHITE);
}

function drawTitle(game: Game): void {
  centered(70, 'BREAKOUT', YELLOW, 3);
  centered(110, 'TypeScript -> C++ with Zinc', DIM, 1);
  centered(150, 'SPACE / ENTER / CLICK to start', WHITE, 1);
  centered(166, 'arrows, A/D or mouse to move', DIM, 1);
  if (game.best > 0) centered(190, `best ${game.best}`, GREEN, 1);
}

function drawMessage(game: Game): void {
  if (game.attract) centered(height() / 2, 'DEMO - press SPACE to play', YELLOW, 1);
  else if (game.phase === Phase.Serve) centered(150, 'press SPACE to serve', WHITE, 1);
  else if (game.phase === Phase.Over) {
    centered(100, 'GAME OVER', RED, 3);
    centered(140, `final score ${game.score}`, WHITE, 1);
  } else if (game.phase === Phase.Cleared) {
    centered(100, `LEVEL ${game.level} CLEARED`, GREEN, 2);
    centered(140, 'press SPACE for the next level', WHITE, 1);
  }
}

export function draw(game: Game): void {
  clear(BACKGROUND);
  rect(0, 14, width(), 1, RULE);
  text(4, 4, hud(game), INK, 1);
  if (game.phase === Phase.Title) {
    drawTitle(game);
    return;
  }
  drawField(game);
  drawMessage(game);
}
