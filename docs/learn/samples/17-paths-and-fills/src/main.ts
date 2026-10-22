import { onFrame, width, height } from 'zinc:gfx';
import { CanvasRenderingContext2D } from 'zinc:canvas';

const ctx = new CanvasRenderingContext2D();
let told = false;

onFrame((dt: number) => {
  ctx.begin(0, 0, width(), height());   // the canvas is the whole window

  // the sky and the grass: rectangles
  ctx.fillStyle = '#bde0fe';
  ctx.fillRect(0, 0, 640, 400);
  ctx.fillStyle = '#7bd389';
  ctx.fillRect(0, 300, 640, 100);

  // the sun: a full circle
  ctx.beginPath();
  ctx.arc(540, 80, 44, 0, 2 * Math.PI);
  ctx.fillStyle = 'gold';
  ctx.fill();

  // the walls of the house, filled then outlined
  ctx.fillStyle = '#f4e1c1';
  ctx.fillRect(220, 180, 200, 140);
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#5c4033';
  ctx.strokeRect(220, 180, 200, 140);

  // the roof: a path of three points, closed
  ctx.beginPath();
  ctx.moveTo(200, 184);
  ctx.lineTo(320, 90);
  ctx.lineTo(440, 184);
  ctx.closePath();
  ctx.fillStyle = '#c0392b';
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.stroke();
  if (!told) {
    console.log(`Is 320, 140 in the roof? ${ctx.isPointInPath(320, 140)}. And 120, 140? ${ctx.isPointInPath(120, 140)}.`);
  }

  // the door: a rectangle with round corners
  ctx.beginPath();
  ctx.roundRect(295, 240, 50, 80, 10);
  ctx.fillStyle = '#8e5a3c';
  ctx.fill();

  // a window: two lines make the cross
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(245, 210, 40, 40);
  ctx.strokeRect(245, 210, 40, 40);
  ctx.beginPath();
  ctx.moveTo(265, 210);
  ctx.lineTo(265, 250);
  ctx.moveTo(245, 230);
  ctx.lineTo(285, 230);
  ctx.lineWidth = 2;
  ctx.stroke();

  // a path in the grass: a curve
  ctx.beginPath();
  ctx.moveTo(320, 320);
  ctx.quadraticCurveTo(300, 360, 360, 400);
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#d9c5a0';
  ctx.stroke();

  ctx.end();
  told = true;
});
