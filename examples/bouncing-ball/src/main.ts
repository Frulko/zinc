// bouncing-ball: immediate-mode 2D with zinc:gfx only. Each frame reads the input, moves the balls and redraws.
// Up / Space adds a hundred balls, Down resets to one, holding the mouse button sprays balls under the pointer.
import { onFrame, clear, rect, width, height, wasPressed, pointerDown, pointerX, pointerY, Btn } from 'zinc:gfx';
import { Ball } from './ball';
import { Hud } from './hud';

const BACKGROUND: u32 = 0x101820;
const MAX_BURST: i32 = 100;

const balls: Ball[] = [new Ball(width() / 2, 20)];
const hud = new Hud();

function spawn(count: i32, x: number, y: number): void {
  for (let i = 0; i < count; i++) balls.push(new Ball(x, y));
}

function handleInput(): void {
  // the first burst rounds the count up to 100
  if (wasPressed(Btn.Up) || wasPressed(Btn.A)) spawn(balls.length < MAX_BURST ? MAX_BURST - 1 : MAX_BURST, width() / 2, height() / 3);
  if (wasPressed(Btn.Down) && balls.length > 1) balls.splice(1, balls.length - 1);
  if (pointerDown()) spawn(1, pointerX(), pointerY());
}

function draw(): void {
  clear(BACKGROUND);
  for (const ball of balls) rect(ball.x, ball.y, ball.size, ball.size, ball.color);
  hud.draw();
}

onFrame((dt: number) => {
  handleInput();
  for (const ball of balls) ball.update(dt, width(), height());
  hud.tick(dt, balls.length);
  draw();
});

console.log('bouncing-ball: started with', balls.length, 'ball');
