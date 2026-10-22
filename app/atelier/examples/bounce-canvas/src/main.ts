import { onFrame, width, height, pointerX, pointerY, pointerDown } from 'zinc:gfx';
import { CanvasRenderingContext2D } from 'zinc:canvas';

const COLORS = ['#f27aa6', '#5ec2f2', '#e8b06a', '#7bd389'];
const NAMES = ['pink', 'blue', 'gold', 'green'];
const R = 30;                 // the radius of the ball
let x = 100, y = 80;          // the centre of the ball
let vx = 150, vy = 110;       // its speed, in pixels per second
let color = 0;                // which colour of COLORS it has
let score = 0;
let wasDown = false;
const ctx = new CanvasRenderingContext2D();

onFrame((dt: number) => {
  // move, and bounce on the edges of the window
  x += vx * dt;
  y += vy * dt;
  if (x < R || x > width() - R) vx = -vx;
  if (y < R || y > height() - R) vy = -vy;

  ctx.begin(0, 0, width(), height());          // the canvas is the whole window
  ctx.fillStyle = '#1c1b20';
  ctx.fillRect(0, 0, width(), height());

  ctx.beginPath();
  ctx.arc(x, y, R, 0, 2 * Math.PI);
  // a press inside the ball's path: the next colour and one more point
  const down = pointerDown();
  if (down && !wasDown && ctx.isPointInPath(pointerX(), pointerY())) {
    color = (color + 1) % COLORS.length;
    score++;
    console.log(`hit: score ${score}, the ball is ${NAMES[color]}`);
  }
  wasDown = down;
  ctx.fillStyle = COLORS[color];
  ctx.fill();

  ctx.font = '20px sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'white';
  ctx.fillText(`Score: ${score}`, 16, 12);
  ctx.end();
});
