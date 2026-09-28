// mapper: GPU video mapping (zinc:mapping on display-gl) controlled over OSC. The web companion
// (companion/server.mjs) serves the editor and relays it to this app as OSC.
// Usage: mapper [--media DIR]   (default: media). Keys: Tab status card, F fullscreen, Esc quit.
// Any runtime image id can feed a layer (video player, camera, gfx.createImage), also over OSC:
// /layer/<n>/source "image" <id>. Player image ids are stable per player, so saved setups keep their videos.
import * as gfx from 'zinc:gfx';
import * as mapping from 'zinc:mapping';
import { Player, EXTENSIONS, LOOP } from 'zinc:video';
import { args } from 'zinc:sys';
import { createDemoLayers } from './layers';
import { liveImage, paintLiveImage } from './live';
import { drawHud } from './hud';

const OSC_PORT: i32 = 9000;
const SETUP_FILE = 'mapping.json';   // written by the companion's "save", read at start

/** --media DIR, else 'media'. */
function mediaFolder(): string {
  const argv = args();
  const at = argv.indexOf('--media');
  return at >= 0 && at + 1 < argv.length ? argv[at + 1] : 'media';
}

// the videos of the folder, looped on one layer
const player = new Player(640, 360);
player.repeat = LOOP;
const videos = player.addFolder(mediaFolder(), EXTENSIONS);
if (videos > 0) player.play();

// a saved setup, else the demo layers
let videoLayer = -1;   // bound to the player image once the player knows its frame size
if (!mapping.load(SETUP_FILE)) videoLayer = createDemoLayers(liveImage, videos > 0);
mapping.listen(OSC_PORT);
console.log(`mapper: OSC on udp ${OSC_PORT}, ${mapping.layerCount()} layers (Tab: status, F: fullscreen, Esc: quit)`);

let showHud = true;
let t = 0, fps = 60;

gfx.onFrame((dt: number) => {
  t += dt;
  if (dt > 0) fps = fps * 0.95 + (1 / dt) * 0.05;
  if (gfx.wasPressed(gfx.Btn.Select)) showHud = !showHud;
  if (videoLayer >= 0 && player.image >= 0) { mapping.setImage(videoLayer, player.image); videoLayer = -1; }
  paintLiveImage(t);

  gfx.clear(0);   // display-gl key colour: the GPU layers show through, only the status card covers them
  if (showHud) {
    drawHud([
      { label: 'OSC', value: `udp ${OSC_PORT}` },
      { label: 'Layers', value: `${mapping.layerCount()}` },
      { label: 'Videos', value: `${videos}` },
      { label: 'Frame rate', value: `${Math.round(fps)} fps` },
    ], 'Tab hides');
  }
});
