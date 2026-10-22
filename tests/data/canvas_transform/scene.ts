// A canvas drawing in a 200 x 160 box (tests/t1/canvas.sh): moved.ts draws it under zinc:gfx's setTransform with the box at (0, 0),
// placed.ts with no transform and the box at its place; both frames must be the same pixels.
import { CanvasRenderingContext2D, Canvas } from 'zinc:canvas';

export const BOX_X = 60, BOX_Y = 40;     // a 320 x 240 window
const ctx = new CanvasRenderingContext2D();
const tile = new Canvas(40, 40);
const tileCtx = tile.getContext('2d');
tileCtx.begin();
tileCtx.fillStyle = '#7bd389';
tileCtx.fillRect(0, 0, 40, 40);
tileCtx.fillStyle = '#1d1b18';
tileCtx.fillRect(10, 10, 20, 20);
tileCtx.end();

export function scene(x: number, y: number): void {
  ctx.begin(x, y, 200, 160);
  ctx.fillStyle = '#2a2930';
  ctx.fillRect(0, 0, 200, 160);
  ctx.beginPath();                               // a solid fill
  ctx.arc(50, 50, 30, 0, 2 * Math.PI);
  ctx.fillStyle = 'tomato';
  ctx.fill();
  const glow = ctx.createRadialGradient(140, 50, 5, 140, 50, 34);   // a gradient: its points move with the shape
  glow.addColorStop(0, '#ffd166');
  glow.addColorStop(1, '#5ec2f2');
  ctx.fillGradient = glow;
  ctx.beginPath();
  ctx.arc(140, 50, 34, 0, 2 * Math.PI);
  ctx.fill();
  ctx.beginPath();                               // a stroke: filled outlines
  ctx.moveTo(20, 140);
  ctx.lineTo(80, 100);
  ctx.lineTo(120, 140);
  ctx.lineWidth = 6;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'white';
  ctx.stroke();
  ctx.drawImage(tile.image, 140, 100, 40, 40);   // an image
  ctx.end();
}
