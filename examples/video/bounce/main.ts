// A looping video bouncing around the screen like the DVD logo; the frame colour changes on every bounce.
// Usage: bounce [video file] [--size WIDTH] [--speed PX_PER_S]   (default: media/fractal.mp4)
// Keys: Space pause, Up/Down speed, Esc quit.
import * as gfx from 'zinc:gfx';
import * as sys from 'zinc:sys';
import * as fs from 'zinc:fs';
import { Player } from 'zinc:video';

const W = gfx.width(), H = gfx.height();
let file = '', size = Math.floor(W / 3), speed = W / 4;
const args = sys.args();
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--size' && i + 1 < args.length) size = parseInt(args[++i]);
  else if (args[i] === '--speed' && i + 1 < args.length) speed = parseFloat(args[++i]);
  else file = args[i];
}
if (file === '') for (const c of ['media/fractal.mp4', '../../media/fractal.mp4', 'examples/video/bounce/media/fractal.mp4']) if (fs.exists(c)) { file = c; break; }

// 16:9 box decoded at the size it is drawn (a row copy per line, no scaling on the main thread)
const bw = size, bh = Math.floor(size * 9 / 16);
const video = new Player(bw, bh);
if (!video.add(file)) { console.error(`bounce: cannot play '${file}'`); sys.exit(1); }
video.play();

const COLORS: u32[] = [0xFF4040, 0x40FF60, 0x4080FF, 0xFFD040, 0xFF40E0, 0x40F0FF];
let x = (W - bw) / 3, y = (H - bh) / 4, vx = 1, vy = 1, hue = 0, corners = 0, paused = false;

gfx.onFrame((dt: number) => {
  if (gfx.wasPressed(gfx.Btn.A)) { paused = !paused; video.pause(paused); }
  if (gfx.isDown(gfx.Btn.Up)) speed = Math.min(speed * 1.02, W * 2);
  if (gfx.isDown(gfx.Btn.Down)) speed = Math.max(speed / 1.02, 10);
  if (!paused) {
    x += vx * speed * dt;
    y += vy * speed * dt;
    let hits = 0;
    if (x < 0) { x = -x; vx = 1; hits++; }
    if (x > W - bw) { x = 2 * (W - bw) - x; vx = -1; hits++; }
    if (y < 0) { y = -y; vy = 1; hits++; }
    if (y > H - bh) { y = 2 * (H - bh) - y; vy = -1; hits++; }
    if (hits > 0) hue = (hue + 1) % COLORS.length;
    if (hits > 1) corners++;
  }
  gfx.clear(0x000000);
  const px = Math.round(x), py = Math.round(y);
  gfx.rect(px - 3, py - 3, bw + 6, bh + 6, COLORS[hue]);
  video.draw(px, py, bw, bh);
  gfx.text(8, H - 16, `corners: ${corners}  loop ${video.loops}`, 0x808080, 1);
});
