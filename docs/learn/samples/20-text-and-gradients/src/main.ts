import { onFrame, width, height } from 'zinc:gfx';
import { CanvasRenderingContext2D } from 'zinc:canvas';

const ctx = new CanvasRenderingContext2D();
const TITLE = 'Summer Fair';
let told = false;

onFrame((dt: number) => {
  ctx.begin(0, 0, width(), height());

  // the sky: a linear gradient from the top of the window to the bottom
  const sky = ctx.createLinearGradient(0, 0, 0, 400);
  sky.addColorStop(0, '#ff9a8b');
  sky.addColorStop(0.6, '#ffc3a0');
  sky.addColorStop(1, '#ffe8c2');
  ctx.fillGradient = sky;                    // on the web: ctx.fillStyle = sky
  ctx.fillRect(0, 0, 640, 400);

  // the sun: a radial gradient, yellow in the middle, fading out at the edge
  const glow = ctx.createRadialGradient(320, 250, 30, 320, 250, 150);
  glow.addColorStop(0, 'rgba(255, 236, 140, 1)');
  glow.addColorStop(1, 'rgba(255, 236, 140, 0)');
  ctx.fillGradient = glow;
  ctx.beginPath();
  ctx.arc(320, 250, 150, 0, 2 * Math.PI);
  ctx.fill();

  // the title, centred: textAlign says which point of the text x is
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 56px sans-serif';
  ctx.fillStyle = '#5a189a';
  ctx.fillText(TITLE, 320, 130);

  // a label in a pill: measureText says how wide the text is, the pill is drawn around it
  ctx.font = '20px sans-serif';
  const words = 'Saturday, 10 am to 6 pm';
  const w = ctx.measureText(words).width;
  ctx.beginPath();
  ctx.roundRect(320 - w / 2 - 18, 160, w + 36, 40, 20);
  ctx.fillStyle = 'white';
  ctx.fill();
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#5a189a';
  ctx.fillText(words, 320, 180);

  // two corners: x is where the text starts (left) or where it ends (right)
  ctx.font = 'bold 18px sans-serif';
  ctx.fillStyle = '#7b2cbf';
  ctx.textAlign = 'left';
  ctx.fillText('Town square', 24, 370);
  ctx.textAlign = 'right';
  ctx.fillText('Free entry', 616, 370);

  if (!told) {
    ctx.font = 'bold 56px sans-serif';
    console.log(`The title is ${Math.round(ctx.measureText(TITLE).width)} pixels wide, the label ${Math.round(w)}.`);
    told = true;
  }
  ctx.end();
});
