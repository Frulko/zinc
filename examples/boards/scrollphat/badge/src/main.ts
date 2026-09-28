// badge: a scrolling name badge for the Scroll pHAT (11x5 LEDs): your name, then the Pi's IP address (handy for a
// headless Pi: plug it in, read the address, ssh in). The address is refreshed every 30 seconds.
// Name: first program argument, or NAME below.
import { onFrame, clear, width, height, wasPressed, Btn } from 'zinc:gfx';
import { drawText, textWidth, FONT_3X5 } from 'zinc:pixelfont';
import { args } from 'zinc:sys';
import { localIp } from './ip';

const NAME = 'ZINC';
const SPEED = 8;           // columns per second
const GAP = '   ';

const W = width(), H = height();
const name = args().length > 0 ? args()[0] : NAME;
let line = `${name}${GAP}`;
let lineW = textWidth(line, FONT_3X5);
let scroll = 0;
let refresh = 0;

function update(ip: string): void {
  line = `${name}${GAP}${ip.length > 0 ? ip : 'NO NETWORK'}${GAP}`;
  lineW = textWidth(line, FONT_3X5);
}

async function refreshIp(): Promise<void> {
  const ip = await localIp();
  update(ip);
  console.log(`badge: ${name} / ${ip.length > 0 ? ip : 'no network'}`);
}

refreshIp();
onFrame((dt: number) => {
  refresh += dt;
  if (refresh >= 30) { refresh = 0; refreshIp(); }
  if (wasPressed(Btn.A)) scroll = 0;  // Space (Mac): restart from the name
  scroll += SPEED * dt;
  if (scroll >= lineW) scroll -= lineW;
  const x = -Math.floor(scroll);
  clear(0x000000);
  // two copies side by side: the loop has no visible seam
  drawText(x, Math.floor((H - 5) / 2), line, 0xffffff, FONT_3X5, 0, W);
  drawText(x + lineW, Math.floor((H - 5) / 2), line, 0xffffff, FONT_3X5, 0, W);
});
