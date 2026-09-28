// Game rules: a small state machine (title, serve, play, game over, level cleared), the paddle, the ball and the
// score. After two idle seconds on the title screen the game plays itself (attract mode) until a key is pressed.
import { width, height } from 'zinc:gfx';
import { Brick, buildWall } from './bricks';
import { Controls } from '../input';

export enum Phase { Title, Serve, Play, Over, Cleared }

export const BALL_SIZE = 5;
export const PADDLE_HEIGHT = 5;
export const PADDLE_Y = height() - 18;
const HUD_BOTTOM = 16;            // the ball bounces off the line under the score
const PADDLE_KEY_SPEED = 260;     // px/s with the arrow keys
const PADDLE_DEMO_SPEED = 300;    // px/s in attract mode
const ATTRACT_DELAY = 2;          // idle seconds on the title screen before the demo starts
const MAX_BOUNCE_ANGLE = 1.1;     // radians from vertical at the paddle's edges

/** The tunable rules. DefaultRules is the game as shipped; examples/scripting/breakout-mods swaps in a JavaScript
 *  mod (zinc:script) that implements the same interface. */
export interface Rules {
  /** Ball speed (px/s) when a level starts. */
  serveSpeed(level: i32): number;
  /** Ball speed after it breaks a brick. */
  speedUp(speed: number): number;
  /** Points for a brick worth `base`, `combo` bricks after the last paddle hit. */
  points(base: i32, level: i32, combo: i32): i32;
}
export class DefaultRules implements Rules {
  serveSpeed(level: i32): number { return 150 + (level - 1) * 25; }
  speedUp(speed: number): number { return speed + 1.5; }
  points(base: i32, level: i32, combo: i32): i32 { return base; }
}

export class Game {
  rules: Rules = new DefaultRules();
  phase = Phase.Title;
  bricks: Brick[] = [];
  level: i32 = 1;
  lives: i32 = 3;
  score: i32 = 0;
  best: i32 = 0;
  attract = false;
  paddleX = width() / 2 - 24;
  paddleWidth = 48;
  ballX = 0;
  ballY = 0;
  private vx = 0;
  private vy = 0;
  private speed = 150;
  private idle = 0;
  private combo: i32 = 0;

  constructor() {
    this.startLevel(1);
  }

  /** One frame of game logic. */
  update(dt: number, input: Controls): void {
    const go = input.confirm || (input.click && this.phase !== Phase.Play);
    if (this.attract && (go || input.left || input.right)) this.backToTitle();   // a key press ends the demo
    if (this.phase === Phase.Title) this.updateTitle(dt, go);
    else if (this.phase === Phase.Serve) this.updateServe(dt, input, go);
    else if (this.phase === Phase.Play) this.updatePlay(dt, input);
    else if (this.phase === Phase.Over && (go || this.attract)) this.backToTitle();
    else if (this.phase === Phase.Cleared && (go || this.attract)) this.nextLevel();
  }

  private updateTitle(dt: number, go: boolean): void {
    this.idle += dt;
    if (go) this.newGame();
    else if (this.idle > ATTRACT_DELAY) {
      this.newGame();
      this.attract = true;
    }
  }

  private updateServe(dt: number, input: Controls, go: boolean): void {
    this.movePaddle(dt, input);
    this.ballX = this.paddleX + this.paddleWidth / 2 - 2;   // the ball rides on the paddle
    this.ballY = PADDLE_Y - 6;
    if (go || this.attract) this.serve();
  }

  private updatePlay(dt: number, input: Controls): void {
    this.movePaddle(dt, input);
    this.moveBall(dt);
    this.hitPaddle();
    this.hitBrick();
    if (this.ballY > height()) this.loseLife();
    if (this.bricks.every(b => !b.alive)) this.phase = Phase.Cleared;
  }

  private newGame(): void {
    this.lives = 3;
    this.score = 0;
    this.startLevel(1);
    this.phase = Phase.Serve;
  }

  private backToTitle(): void {
    this.attract = false;
    this.phase = Phase.Title;
    this.idle = 0;
  }

  private nextLevel(): void {
    this.startLevel(this.level + 1);
    this.phase = Phase.Serve;
  }

  /** New wall; each level is faster and the paddle narrower. */
  private startLevel(level: i32): void {
    this.level = level;
    this.bricks = buildWall(level);
    this.speed = this.rules.serveSpeed(level);
    this.paddleWidth = Math.max(28, 52 - (level - 1) * 4);
  }

  /** Launches the ball upwards, up to 0.4 rad off vertical. */
  private serve(): void {
    this.launch(-Math.PI / 2 + (Math.random() - 0.5) * 0.8);
    this.phase = Phase.Play;
  }

  private launch(angle: number): void {
    this.vx = Math.cos(angle) * this.speed;
    this.vy = Math.sin(angle) * this.speed;
  }

  private movePaddle(dt: number, input: Controls): void {
    if (this.attract) {
      // the demo paddle chases the ball at a limited speed
      const target = this.ballX - (this.paddleX + this.paddleWidth / 2 - 2);
      const step = PADDLE_DEMO_SPEED * dt;
      this.paddleX += Math.max(-step, Math.min(step, target));
    } else {
      if (input.pointerMoved) this.paddleX = input.pointerX - this.paddleWidth / 2;
      if (input.left) this.paddleX -= PADDLE_KEY_SPEED * dt;
      if (input.right) this.paddleX += PADDLE_KEY_SPEED * dt;
    }
    this.paddleX = Math.max(2, Math.min(width() - this.paddleWidth - 2, this.paddleX));
  }

  /** Moves the ball and bounces it off the side walls and the ceiling. */
  private moveBall(dt: number): void {
    this.ballX += this.vx * dt;
    this.ballY += this.vy * dt;
    if (this.ballX < 0) {
      this.ballX = 0;
      this.vx = Math.abs(this.vx);
    }
    if (this.ballX + BALL_SIZE > width()) {
      this.ballX = width() - BALL_SIZE;
      this.vx = -Math.abs(this.vx);
    }
    if (this.ballY < HUD_BOTTOM) {
      this.ballY = HUD_BOTTOM;
      this.vy = Math.abs(this.vy);
    }
  }

  /** The bounce angle depends on where the ball hits the paddle: the edges send it sideways. */
  private hitPaddle(): void {
    const bottom = this.ballY + BALL_SIZE;
    const overPaddle = this.ballX + BALL_SIZE >= this.paddleX && this.ballX <= this.paddleX + this.paddleWidth;
    if (this.vy <= 0 || bottom < PADDLE_Y || bottom > PADDLE_Y + 8 || !overPaddle) return;
    const offset = (this.ballX + BALL_SIZE / 2 - (this.paddleX + this.paddleWidth / 2)) / (this.paddleWidth / 2);
    this.launch(-Math.PI / 2 + offset * MAX_BOUNCE_ANGLE);
    this.ballY = PADDLE_Y - BALL_SIZE;
    this.combo = 0;
  }

  /** Breaks the first brick the ball overlaps and reflects the ball on the axis of least overlap. */
  private hitBrick(): void {
    const x = this.ballX, y = this.ballY;
    for (const brick of this.bricks) {
      const touching = x + BALL_SIZE >= brick.x && x <= brick.x + brick.w && y + BALL_SIZE >= brick.y && y <= brick.y + brick.h;
      if (!brick.alive || !touching) continue;
      brick.alive = false;
      this.score += this.rules.points(brick.points, this.level, this.combo);
      this.combo++;
      this.speed = this.rules.speedUp(this.speed);
      const overlapX = Math.min(x + BALL_SIZE - brick.x, brick.x + brick.w - x);
      const overlapY = Math.min(y + BALL_SIZE - brick.y, brick.y + brick.h - y);
      if (overlapX < overlapY) this.vx = -this.vx;
      else this.vy = -this.vy;
      return;
    }
  }

  private loseLife(): void {
    this.lives--;
    this.phase = this.lives > 0 ? Phase.Serve : Phase.Over;
    if (this.score > this.best) this.best = this.score;
  }
}
