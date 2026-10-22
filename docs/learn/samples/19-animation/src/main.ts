import { onFrame, width, height } from 'zinc:gfx';
import { CanvasRenderingContext2D } from 'zinc:canvas';

const ctx = new CanvasRenderingContext2D();
const TURN_SPEED = Math.PI / 2;   // the blades turn a quarter of a turn per second
let angle = 0;                    // how far the blades have turned, in radians
let cloudX = 0;                   // how far the clouds have moved
let time = 0;
let told = false;

function cloud(x: number, y: number): void {
  ctx.beginPath();
  ctx.arc(x, y, 26, 0, 2 * Math.PI);
  ctx.arc(x + 30, y - 12, 32, 0, 2 * Math.PI);
  ctx.arc(x + 64, y, 24, 0, 2 * Math.PI);
  ctx.fill();
}

onFrame((dt: number) => {
  time += dt;
  angle += TURN_SPEED * dt;
  cloudX = (cloudX + 40 * dt) % 800;
  if (!told && time >= 1) {
    console.log(`After ${time.toFixed(2)} seconds the blades turned ${Math.round((angle * 180) / Math.PI)} degrees.`);
    told = true;
  }

  ctx.begin(0, 0, width(), height());
  ctx.fillStyle = '#9fd3f5';                    // every frame starts from an empty sky
  ctx.fillRect(0, 0, 640, 400);
  ctx.fillStyle = '#7bd389';
  ctx.fillRect(0, 320, 640, 80);

  ctx.fillStyle = 'white';                      // two clouds drift to the right and come back on the left
  cloud(cloudX - 100, 80);
  cloud(((cloudX + 400) % 800) - 100, 130);

  ctx.beginPath();                              // the tower
  ctx.moveTo(300, 320);
  ctx.lineTo(312, 170);
  ctx.lineTo(328, 170);
  ctx.lineTo(340, 320);
  ctx.closePath();
  ctx.fillStyle = '#e9e6df';
  ctx.fill();

  ctx.save();                                   // the blades: move to the hub, turn by the angle, draw four blades
  ctx.translate(320, 170);
  ctx.rotate(angle);
  ctx.fillStyle = '#e63946';
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(18, -20);
    ctx.lineTo(10, -120);
    ctx.lineTo(-6, -120);
    ctx.closePath();
    ctx.fill();
    ctx.rotate(Math.PI / 2);
  }
  ctx.restore();

  ctx.beginPath();
  ctx.arc(320, 170, 9, 0, 2 * Math.PI);
  ctx.fillStyle = '#1d1b18';
  ctx.fill();
  ctx.end();
});
