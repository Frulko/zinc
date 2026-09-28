// bounce: a looping video bouncing around the screen like the DVD logo; its frame changes colour on every bounce.
// Usage: bounce [video file] [--size WIDTH] [--speed PX_PER_S]   (default: media/fractal.mp4)
// Keys: Space pause, Up/Down speed, Esc quit.
import * as gfx from 'zinc:gfx';
import * as sys from 'zinc:sys';
import * as fs from 'zinc:fs';
import { Player } from 'zinc:video';
import { Bouncer } from './bouncer';
import { drawHud } from './hud';

const W = gfx.width(), H = gfx.height();
const BACKGROUND: u32 = 0x09090b;   // zinc-950
const FRAME = 3;                    // coloured frame around the video, in px

interface Options { file: string; size: number; speed: number }

/** Command line: an optional file, --size (box width) and --speed. */
function parseOptions(): Options {
  const o: Options = { file: '', size: Math.floor(W / 3), speed: W / 4 };
  const args = sys.args();
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--size' && i + 1 < args.length) o.size = parseInt(args[++i]);
    else if (args[i] === '--speed' && i + 1 < args.length) o.speed = parseFloat(args[++i]);
    else o.file = args[i];
  }
  // the sample clip, whether we run from the project folder, the build folder or the repository root
  if (o.file === '') {
    for (const c of ['media/fractal.mp4', '../../media/fractal.mp4', 'examples/video/bounce/media/fractal.mp4']) {
      if (fs.exists(c)) { o.file = c; break; }
    }
  }
  return o;
}

const options = parseOptions();
// a 16:9 box, decoded at the size it is drawn: drawing a frame is a row copy, no scaling on the main thread
const boxW = options.size, boxH = Math.floor(options.size * 9 / 16);
const video = new Player(boxW, boxH);
if (!video.add(options.file)) { console.error(`bounce: cannot play '${options.file}'`); sys.exit(1); }
video.play();

const box = new Bouncer((W - boxW) / 3, (H - boxH) / 4, options.speed);
let paused = false;

function handleKeys(): void {
  if (gfx.wasPressed(gfx.Btn.A)) { paused = !paused; video.pause(paused); }
  if (gfx.isDown(gfx.Btn.Up)) box.speed = Math.min(box.speed * 1.02, W * 2);
  if (gfx.isDown(gfx.Btn.Down)) box.speed = Math.max(box.speed / 1.02, 10);
}

gfx.onFrame((dt: number) => {
  handleKeys();
  if (!paused) box.step(dt, boxW, boxH, W, H);

  gfx.clear(BACKGROUND);
  const x = Math.round(box.x), y = Math.round(box.y);
  gfx.rrect(x - FRAME, y - FRAME, boxW + 2 * FRAME, boxH + 2 * FRAME, 4, box.color, 255);
  video.draw(x, y, boxW, boxH);
  drawHud([
    { label: 'Corners', value: `${box.corners}` },
    { label: 'Loops', value: `${video.loops}` },
    { label: 'Speed', value: `${Math.round(box.speed)} px/s` },
  ], paused, 12, H - 12);
});
