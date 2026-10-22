// A sketch on the web's Canvas API (zinc:canvas). zinc:gfx's frame loop calls the function below about 60 times a second, and it
// paints the whole window with `ctx`, the way a web page paints a <canvas>. Click to blow bubbles.
import { onFrame, width, height, pointerX, pointerY, pointerDown } from 'zinc:gfx';
import { CanvasRenderingContext2D } from 'zinc:canvas';

const ctx = new CanvasRenderingContext2D();
const bubbles: number[] = [];   // three numbers per bubble: x, y and its age in seconds
let time = 0;
let wasDown = false;

// A star path with `points` points around (cx, cy).
function star(cx: number, cy: number, points: i32, outer: number, inner: number): void {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const angle = (i * Math.PI) / points - Math.PI / 2;
    ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
  }
  ctx.closePath();
}

onFrame((dt: number) => {
  time += dt;
  const w = width(), h = height();
  const down = pointerDown();
  if (down && !wasDown) {
    bubbles.push(pointerX());
    bubbles.push(pointerY());
    bubbles.push(0);
  }
  wasDown = down;

  ctx.begin(0, 0, w, h);                       // the canvas is the whole window

  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#14213d');
  sky.addColorStop(1, '#6d3b8c');
  ctx.fillGradient = sky;                      // on the web: ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h);

  ctx.save();                                  // a star that turns: move to its centre, turn, draw around (0, 0)
  ctx.translate(w / 2, h / 2 - 30);
  ctx.rotate(time * 0.8);
  star(0, 0, 5, 80, 34);
  ctx.fillStyle = '#ffd166';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#f4a259';
  ctx.stroke();
  ctx.restore();

  ctx.lineWidth = 3;
  ctx.strokeStyle = '#9be7ff';
  for (let i = 0; i < bubbles.length; i += 3) {   // each bubble rises, grows and fades out in two seconds
    bubbles[i + 2] += dt;
    const age = bubbles[i + 2];
    ctx.globalAlpha = Math.max(0, 1 - age / 2);
    ctx.beginPath();
    ctx.arc(bubbles[i], bubbles[i + 1] - age * 80, 12 + age * 10, 0, 2 * Math.PI);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  while (bubbles.length > 0 && bubbles[2] > 2) bubbles.splice(0, 3);   // forget the oldest when it has faded

  ctx.textAlign = 'center';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillStyle = 'white';
  ctx.fillText('Hello, canvas', w / 2, h - 64);
  ctx.font = '16px sans-serif';
  ctx.fillStyle = '#c9c3e6';
  ctx.fillText('click to blow bubbles', w / 2, h - 36);
  ctx.end();
});
