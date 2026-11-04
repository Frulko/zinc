// mapper: GPU video mapping (zinc:mapping on display-gl). Any browser edits it live through the web editor the app serves (services/web.ts); OSC desks reach the same commands.
// Usage: mapper [--media DIR] [--port N] [--web N|off]   (default: media, 9000, 8080). Keys: Tab status card, Left/Right columns, F fullscreen, Esc quit.
import * as gfx from 'zinc:gfx';
import * as mapping from 'zinc:mapping';
import { args } from 'zinc:sys';
import { DEFAULT_MEDIA_DIR, DEFAULT_OSC_PORT, DEFAULT_WEB_PORT, SETUP_FILE } from './constants';
import { drawHud, drawAddress } from './hud';
import { drawOutputCard } from './services/cards';
import { createDemoLayers } from './layers';
import { liveImage, paintLiveImage } from './live';
import { isHudShown, listenOsc, setHudShown } from './services/control';
import { bindDecodedVideos, followLayerMedia, useMediaFolder } from './services/layerMedia';
import { openMediaFolder, videoCount } from './services/mediaStore';
import { openScenes } from './services/scenes';
import { loadShow, resumeShow, stepColumn } from './services/show';
import { loadVolume } from './services/sound';
import { startWebEditor } from './services/web';

/** The value after --name, else the fallback. */
function option(name: string, fallback: string): string {
  const argv = args();
  const at = argv.indexOf(`--${name}`);
  return at >= 0 && at + 1 < argv.length ? argv[at + 1] : fallback;
}

const mediaDir = option('media', DEFAULT_MEDIA_DIR);
openMediaFolder(mediaDir);
useMediaFolder(mediaDir);

// a saved setup starts as it was left, with a clean picture; a first start shows the demo layers and how to reach the editor
const hadSetup = mapping.load(SETUP_FILE);
if (!hadSetup) createDemoLayers(liveImage);
setHudShown(!hadSetup);
loadShow();
followLayerMedia();
loadVolume();
resumeShow();
openScenes();

const oscPort: i32 = parseInt(option('port', DEFAULT_OSC_PORT));
const oscOn = listenOsc(oscPort);
const webPort = option('web', DEFAULT_WEB_PORT);
const editorUrl = webPort === 'off' ? '' : startWebEditor(parseInt(webPort));
console.log(`mapper: ${oscOn ? `OSC on udp ${oscPort}` : 'no OSC'}, ${mapping.layerCount()} layers (Tab: status, F: fullscreen, Esc: quit)`);
if (editorUrl !== '') console.log(`mapper: editor at ${editorUrl}`);

let t = 0, fps = 60;

gfx.onFrame((dt: number) => {
  t += dt;
  if (dt > 0) fps = fps * 0.95 + (1 / dt) * 0.05;
  if (gfx.wasPressed(gfx.Btn.Select)) setHudShown(!isHudShown());
  if (gfx.wasPressed(gfx.Btn.Right)) stepColumn(1);
  if (gfx.wasPressed(gfx.Btn.Left)) stepColumn(-1);
  bindDecodedVideos();
  paintLiveImage(t);

  gfx.clear(0);   // display-gl key colour: the GPU layers show through, only the status card covers them
  drawOutputCard();
  if (!isHudShown()) return;
  drawHud([
    { label: 'OSC', value: oscOn ? `udp ${oscPort}` : 'off' },
    { label: 'Layers', value: `${mapping.layerCount()}` },
    { label: 'Videos', value: `${videoCount()}` },
    { label: 'Frame rate', value: `${Math.round(fps)} fps` },
  ], 'Tab hides');
  if (editorUrl !== '') drawAddress(editorUrl);
});
