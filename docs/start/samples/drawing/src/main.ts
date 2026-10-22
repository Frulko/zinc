import { onFrame, clear, rrect, font, drawText, width, height, pointerX, pointerY, pointerDown } from 'zinc:gfx';

const COLORS: u32[] = [0xf27aa6, 0x5ec2f2, 0xe8b06a, 0x7bd389];
const NAMES = ['pink', 'blue', 'gold', 'green'];
const R = 30;                 // the radius of the ball
let x = 100, y = 80;          // the centre of the ball
let vx = 150, vy = 110;       // its speed, in pixels per second
let color = 0;                // which colour of COLORS it has
let score = 0;
let wasDown = false;
const label = font('sans', 20);

onFrame((dt: number) => {
  // move, and bounce on the edges of the window
  x += vx * dt;
  y += vy * dt;
  if (x < R || x > width() - R) vx = -vx;
  if (y < R || y > height() - R) vy = -vy;

  // a press on the ball: the next colour and one more point
  const down = pointerDown();
  if (down && !wasDown) {
    const dx = pointerX() - x, dy = pointerY() - y;
    if (dx * dx + dy * dy <= R * R) {
      color = (color + 1) % COLORS.length;
      score++;
      console.log(`hit: score ${score}, the ball is ${NAMES[color]}`);
    }
  }
  wasDown = down;

  // draw the whole picture again
  clear(0x1c1b20);
  rrect(x - R, y - R, 2 * R, 2 * R, R, COLORS[color], 255);
  drawText(label, 16, 12, `Score: ${score}`, 0xffffff, 255, 0);
});
