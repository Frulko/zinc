// The Kenney skin (owner, 2026-10-17): the bricks, the paddle and the ball of Kenney's Puzzle Pack (CC0, assets/kenney) drawn as sprites over a
// starry blue, in the places and sizes the rules give them; the HUD and the messages are render.ts's. Without the images (a target whose build
// bakes no assets) main.ts keeps render.ts's original look.
import { clear, rect, text, image, drawImage, width, height } from 'zinc:gfx';
import { Game, Phase, BALL_SIZE, PADDLE_HEIGHT, PADDLE_Y } from './game/game';
import { hud, drawTitle, drawMessage } from './render';

const BACKGROUND: u32 = 0x2b3763;
const RULE: u32 = 0x43518a;
const INK: u32 = 0xe0e6ff;

function sprite(name: string): i32 {
  return image('kenney/' + name + '.png');
}
const BALL = sprite('ballGrey');
const PADDLE = sprite('paddleRed');
const STAR = sprite('particleSmallStar');
// the wall's row colours (bricks.ts) and their Kenney bricks
const COLORS: u32[] = [0xff4d4d, 0xff9f43, 0xfeca57, 0x1dd1a1, 0x54a0ff, 0x9b59b6, 0xff6b9d, 0xc8d6e5];
const BRICKS: i32[] = [sprite('element_red_rectangle_glossy'), sprite('element_yellow_rectangle'), sprite('element_yellow_rectangle_glossy'),
  sprite('element_green_rectangle_glossy'), sprite('element_blue_rectangle_glossy'), sprite('element_purple_rectangle_glossy'),
  sprite('element_red_rectangle'), sprite('element_grey_rectangle_glossy')];

/** Whether every sprite was baked: main.ts draws this skin, else render.ts. */
export function skinLoaded(): boolean {
  if (BALL < 0 || PADDLE < 0 || STAR < 0) return false;
  for (const b of BRICKS) if (b < 0) return false;
  return true;
}

// the stars of the background: fixed places (a small LCG), the same on every run
const starX: number[] = [];
const starY: number[] = [];
let seed: i32 = 7;
for (let i = 0; i < 24; i++) {
  seed = (seed * 1103 + 12345) % 65536;
  starX.push((seed % 1000) / 1000);
  seed = (seed * 1103 + 12345) % 65536;
  starY.push((seed % 1000) / 1000);
}

function brickSprite(color: u32): i32 {
  for (let i = 0; i < COLORS.length; i++) if (COLORS[i] === color) return BRICKS[i];
  return BRICKS[0];
}

function drawBackground(): void {
  clear(BACKGROUND);
  for (let i = 0; i < starX.length; i++) drawImage(STAR, starX[i] * (width() - 12), 18 + starY[i] * (height() - 30), 12, 12, 110, 0);
}

function drawField(game: Game): void {
  for (const brick of game.bricks) if (brick.alive) drawImage(brickSprite(brick.color), brick.x, brick.y, brick.w, brick.h, 255, 0);
  drawImage(PADDLE, game.paddleX, PADDLE_Y - 2, game.paddleWidth, PADDLE_HEIGHT + 4, 255, 0);
  drawImage(BALL, game.ballX - 2, game.ballY - 2, BALL_SIZE + 4, BALL_SIZE + 4, 255, 0);
}

export function drawSkin(game: Game): void {
  drawBackground();
  rect(0, 14, width(), 1, RULE);
  text(4, 4, hud(game), INK, 1);
  if (game.phase === Phase.Title) {
    drawTitle(game);
    return;
  }
  drawField(game);
  drawMessage(game);
}
