import { onFrame, width, height } from 'zinc:gfx';
import { CanvasRenderingContext2D } from 'zinc:canvas';

const ctx = new CanvasRenderingContext2D();
let t = 0;
onFrame((dt: number) => {
  t += dt;
  ctx.begin(0, 0, width(), height());   // the canvas is the whole window
  ctx.fillStyle = '#1c1b20';
  ctx.fillRect(0, 0, width(), height());
  const r = 40 + 10 * Math.sin(t * 2);
  ctx.beginPath();
  ctx.arc(width() / 2, height() / 2, r, 0, 2 * Math.PI);
  ctx.fillStyle = '#9388ff';
  ctx.fill();
  ctx.end();
});
