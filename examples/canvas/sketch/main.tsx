// canvas/sketch: classic HTML canvas demos ported to zinc:canvas, inside a zinc:ui layout.
//  - the w3schools analog clock (radial-gradient rim, rotated numbers, round-capped hands), almost line for line;
//  - fireworks particles with radial alpha glows, trails in an offscreen Canvas (its pixels persist between frames);
//  - a bezier wave, an even-odd star, dashes and joins.
// Click the right panel to launch a rocket.
import { render, createSignal } from 'zinc:ui/solid';
import { pointerDown, pointerX, pointerY } from 'zinc:gfx';
import { CanvasRenderingContext2D, Canvas } from 'zinc:canvas';

const [fps, setFps] = createSignal<string>('');
let time = 0;

// ---------------------------------------------------------------- the clock (w3schools "Canvas Clock")
const clockCtx = new CanvasRenderingContext2D();

function drawClock(ctx: CanvasRenderingContext2D, x: i32, y: i32, w: i32, h: i32): void {
  ctx.begin(x, y, w, h);
  const radius = Math.min(w, h) / 2 * 0.9;
  ctx.save();  // the transform persists between frames, like on the web
  ctx.translate(w / 2, h / 2);
  drawFace(ctx, radius);
  drawNumbers(ctx, radius);
  drawTime(ctx, radius);
  ctx.restore();
  ctx.end();
}
function drawFace(ctx: CanvasRenderingContext2D, radius: number): void {
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, 2 * Math.PI);
  ctx.fillStyle = 'white';
  ctx.fill();
  const grad = ctx.createRadialGradient(0, 0, radius * 0.95, 0, 0, radius * 1.05);
  grad.addColorStop(0, '#333');
  grad.addColorStop(0.5, 'white');
  grad.addColorStop(1, '#333');
  ctx.strokeGradient = grad;  // web: ctx.strokeStyle = grad
  ctx.lineWidth = radius * 0.1;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.1, 0, 2 * Math.PI);
  ctx.fillStyle = '#333';
  ctx.fill();
}
function drawNumbers(ctx: CanvasRenderingContext2D, radius: number): void {
  ctx.font = 'bold 20px sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  for (let num = 1; num < 13; num++) {
    const ang = num * Math.PI / 6;
    ctx.rotate(ang);
    ctx.translate(0, -radius * 0.85);
    ctx.rotate(-ang);
    ctx.fillText(num.toString(), 0, 0);
    ctx.rotate(ang);
    ctx.translate(0, radius * 0.85);
    ctx.rotate(-ang);
  }
}
function drawTime(ctx: CanvasRenderingContext2D, radius: number): void {
  const s = Math.floor(Date.now() / 1000) % 86400;
  const hour = Math.floor(s / 3600) % 12, minute = Math.floor(s / 60) % 60, second = s % 60;
  const h = hour * Math.PI / 6 + minute * Math.PI / (6 * 60) + second * Math.PI / (360 * 60);
  drawHand(ctx, h, radius * 0.5, radius * 0.07);
  drawHand(ctx, minute * Math.PI / 30 + second * Math.PI / (30 * 60), radius * 0.8, radius * 0.07);
  ctx.strokeStyle = '#c0392b';
  drawHand(ctx, second * Math.PI / 30, radius * 0.9, radius * 0.02);
  ctx.strokeStyle = '#333';
}
function drawHand(ctx: CanvasRenderingContext2D, pos: number, length: number, width: number): void {
  ctx.beginPath();
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.moveTo(0, 0);
  ctx.rotate(pos);
  ctx.lineTo(0, -length);
  ctx.stroke();
  ctx.rotate(-pos);
}

// ---------------------------------------------------------------- fireworks
class Particle {
  x: number; y: number; vx: number; vy: number; life: number; hue: number;
  constructor(x: number, y: number, vx: number, vy: number, life: number, hue: number) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.life = life; this.hue = hue;
  }
}
const particles: Particle[] = [];
const rockets: Particle[] = [];
const trails = new Canvas(320, 360);  // offscreen: pixels persist, so fading trails work like on the web
const tctx = trails.getContext('2d');
const fx = new CanvasRenderingContext2D();
let launchIn = 0, wasDown = false;

function launch(x: number): void { rockets.push(new Particle(x, trails.height, (Math.random() - 0.5) * 40, -260 - Math.random() * 80, 1.2, Math.random() * 360)); }
function explode(r: Particle): void {
  for (let i = 0; i < 60; i++) {
    const a = Math.random() * Math.PI * 2, v = 40 + Math.random() * 120;
    particles.push(new Particle(r.x, r.y, Math.cos(a) * v, Math.sin(a) * v, 1 + Math.random() * 0.8, r.hue + Math.random() * 40));
  }
}
function step(dt: number): void {
  launchIn -= dt;
  if (launchIn <= 0) { launch(60 + Math.random() * 200); launchIn = 0.9; }
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i];
    r.x += r.vx * dt; r.y += r.vy * dt; r.vy += 120 * dt;
    if (r.vy > -20) { explode(r); rockets.splice(i, 1); }
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 60 * dt; p.vx *= 0.99; p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}
function drawTrails(): void {
  tctx.begin();
  tctx.fillStyle = 'rgba(8, 10, 24, 0.25)';  // fade the previous frames
  tctx.fillRect(0, 0, trails.width, trails.height);
  for (const r of rockets) {
    tctx.fillStyle = `hsl(${Math.round(r.hue)}, 100%, 75%)`;
    tctx.fillRect(r.x - 1, r.y - 1, 3, 3);
  }
  for (const p of particles) {
    tctx.fillStyle = `hsla(${Math.round(p.hue)}, 100%, 60%, ${Math.min(1, p.life).toFixed(2)})`;
    tctx.beginPath();
    tctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2);
    tctx.fill();
  }
  tctx.end();
}
function Fireworks(x: i32, y: i32, w: i32, h: i32): void {
  const down = pointerDown();
  if (down && !wasDown && pointerX() >= x && pointerX() < x + w && pointerY() >= y && pointerY() < y + h) launch((pointerX() - x) * trails.width / w);
  wasDown = down;
  drawTrails();
  fx.begin(x, y, w, h);
  fx.drawImage(trails.image, 0, 0, w, h);
  // glows on top of the trails: radial gradients fading to transparent
  const sx = w / trails.width, sy = h / trails.height;
  for (const p of particles) {
    if (p.life < 0.6) continue;
    const g = fx.createRadialGradient(p.x * sx, p.y * sy, 0, p.x * sx, p.y * sy, 7);
    g.addColorStop(0, `hsla(${Math.round(p.hue)}, 100%, 85%, 0.9)`);
    g.addColorStop(1, `hsla(${Math.round(p.hue)}, 100%, 50%, 0)`);
    fx.fillGradient = g;
    fx.fillRect(p.x * sx - 7, p.y * sy - 7, 14, 14);
  }
  fx.fillGradient = null;
  fx.font = '14px sans-serif';
  fx.fillStyle = 'rgba(255,255,255,0.7)';
  fx.textAlign = 'right';
  fx.textBaseline = 'bottom';
  fx.fillText(`${particles.length} particles - click to launch`, w - 8, h - 6);
  fx.end();
}

// ---------------------------------------------------------------- shapes strip
const shapes = new CanvasRenderingContext2D();
function Shapes(x: i32, y: i32, w: i32, h: i32): void {
  const ctx = shapes;
  ctx.begin(x, y, w, h);
  const sky = ctx.createLinearGradient(0, 0, w, 0);
  sky.addColorStop(0, '#1e3a8a'); sky.addColorStop(0.5, '#7c3aed'); sky.addColorStop(1, '#db2777');
  ctx.fillGradient = sky;
  ctx.fillRect(0, 0, w, h);
  ctx.fillGradient = null;
  // bezier wave
  ctx.beginPath();
  ctx.moveTo(0, h * 0.7);
  for (let i = 0; i < 4; i++) {
    const x0 = i * w / 4, ph = Math.sin(time * 2 + i) * h * 0.25;
    ctx.bezierCurveTo(x0 + w / 12, h * 0.7 - ph, x0 + w / 6, h * 0.7 + ph, x0 + w / 4, h * 0.7);
  }
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
  ctx.fill();
  // even-odd star with a dashed outline
  ctx.save();
  ctx.translate(w * 0.5, h * 0.42);
  ctx.rotate(time * 0.5);
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + i * Math.PI * 4 / 5;
    if (i === 0) ctx.moveTo(Math.cos(a) * 30, Math.sin(a) * 30); else ctx.lineTo(Math.cos(a) * 30, Math.sin(a) * 30);
  }
  ctx.closePath();
  ctx.fillStyle = '#facc15';
  ctx.fill('evenodd');
  ctx.setLineDash([4, 3]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'white';
  ctx.stroke();
  ctx.restore();
  // joins
  const joins: string[] = ['miter', 'round', 'bevel'];
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.lineJoin = joins[i];
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#e2e8f0';
    const x0 = 20 + i * 60;
    ctx.moveTo(x0, 50); ctx.lineTo(x0 + 20, 16); ctx.lineTo(x0 + 40, 50);
    ctx.stroke();
  }
  ctx.lineJoin = 'miter';
  ctx.beginPath();
  ctx.roundRect(w - 150, 14, 130, 40, 12);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fill();
  ctx.font = 'bold 20px sans-serif';
  ctx.fillStyle = 'white';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('zinc:canvas', w - 85, 34);
  ctx.end();
}

function App(): i32 {
  return <view class="flex-col h-full bg-slate-900">
    <view class="flex-row p-2 justify-between bg-slate-800">
      <text class="text-amber-400">Canvas 2D sketch</text>
      <text class="text-slate-400">{fps()}</text>
    </view>
    <canvas class="h-20" onDraw={Shapes}></canvas>
    <view class="flex-row grow">
      <canvas class="grow bg-slate-700" onDraw={(x: i32, y: i32, w: i32, h: i32) => drawClock(clockCtx, x, y, w, h)}></canvas>
      <canvas class="grow" onDraw={Fireworks}></canvas>
    </view>
  </view>;
}

let acc = 0, frames: i32 = 0;
render(App, 0x0f172a, (dt: number) => {
  time += dt;
  step(dt);
  acc += dt; frames++;
  if (acc >= 0.5) { setFps(`${Math.round(frames / acc)} fps`); acc = 0; frames = 0; }
});
