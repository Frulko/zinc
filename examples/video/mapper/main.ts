// Video mapper: GPU layers (zinc:mapping on display-gl) controlled over OSC. The web companion
// (companion/server.mjs) serves the editor UI and relays it to this app as OSC.
import * as gfx from 'zinc:gfx';
import * as mapping from 'zinc:mapping';
import { Player, EXTENSIONS, LOOP } from 'zinc:video';
import { args } from 'zinc:sys';
// Any runtime image id can feed a layer (video player, camera, gfx.createImage), also over OSC:
// /layer/<n>/source "image" <id>. Player image ids are stable per player, so saved setups keep their videos.

const PORT: i32 = 9000;
const FILE = 'mapping.json';

// A live runtime image, redrawn on the CPU every frame and uploaded by the compositor when its version changes:
// the same path video frames take.
const live = gfx.createImage(256, 256);

// Videos of --media DIR (default: media), looped on one layer.
const argv = args();
const at = argv.indexOf('--media');
const player = new Player(640, 360);
player.repeat = LOOP;
const videos = player.addFolder(at >= 0 && at + 1 < argv.length ? argv[at + 1] : 'media', EXTENSIONS);
if (videos > 0) player.play();
let videoLayer = -1;  // bound once the player knows its frame size

if (!mapping.load(FILE)) {
  const a = mapping.addLayer('pattern', 'test card');
  mapping.set(a, 'corners', [0.05, 0.1, 0.45, 0.14, 0.43, 0.86, 0.07, 0.82]);
  const b = mapping.addLayer('gradient', 'gradient');
  mapping.set(b, 'corners', [0.55, 0.12, 0.95, 0.08, 0.93, 0.9, 0.57, 0.86]);
  mapping.set(b, 'color2', [0.05, 0.05, 0.35]);
  mapping.set(b, 'angle', [90]);
  const c = mapping.addLayer('image', 'live');
  mapping.setImage(c, live);
  mapping.set(c, 'corners', [0.38, 0.3, 0.62, 0.3, 0.62, 0.7, 0.38, 0.7]);
  if (videos > 0) {
    videoLayer = mapping.addLayer('pattern', 'video');
    mapping.set(videoLayer, 'corners', [0.3, 0.62, 0.7, 0.66, 0.68, 0.97, 0.32, 0.93]);
  }
}
mapping.listen(PORT);
console.log(`mapper: OSC on udp ${PORT}, ${mapping.layerCount()} layers (Tab: HUD, F: fullscreen, Esc: quit)`);

let hud = true;
let t = 0;
let fps = 60;
gfx.onFrame((dt: number) => {
  t += dt;
  if (dt > 0) fps = fps * 0.95 + (1 / dt) * 0.05;
  if (gfx.wasPressed(gfx.Btn.Select)) hud = !hud;
  if (videoLayer >= 0 && player.image >= 0) { mapping.setImage(videoLayer, player.image); videoLayer = -1; }

  gfx.beginImage(live);
  gfx.clear(0x101828);
  for (let i = 0; i < 6; i++) {
    const r = 70 + 20 * Math.sin(t * 2 + i);
    gfx.rrect(128 + Math.cos(t + i) * r - 14, 128 + Math.sin(t + i) * r - 14, 28, 28, 14, 0x40a0ff + i * 0x201000, 255);
  }
  gfx.text(92, 116, `${Math.floor(t)}s`, 0xffffff, 3);
  gfx.endImage();

  gfx.clear(0);  // display-gl key colour: black lets the GPU layers show through, only the HUD covers them
  if (hud) gfx.text(12, gfx.height() - 28, `mapper  osc:${PORT}  layers:${mapping.layerCount()}  videos:${videos}  ${Math.round(fps)} fps  [Tab] hud`, 0xc0c8d0, 2);
});
