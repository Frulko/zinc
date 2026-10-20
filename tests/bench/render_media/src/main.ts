// The media scenes of tools/zbench (suite "media"): video decoding and presentation through zinc:video. One scene per launch (ZB_SCENE), the clip comes from ZB_VIDEO (the tool
// makes a deterministic test pattern with ffmpeg, nothing is committed). The engine's profiler measures the frames; the player's own counters (which decoder, frames decoded,
// frames dropped) are printed as `ZB_VIDEO <decoder> frames=<n> dropped=<n> position=<s>` every 30 frames, the last line is the figure.
import { Player, LOOP } from 'zinc:video';
import { onFrame, clear, width, height, quit } from 'zinc:gfx';
import * as sys from 'zinc:sys';

const id = sys.env('ZB_SCENE');
const path = sys.env('ZB_VIDEO');
if (id === 'list' || id.length === 0) {
  console.log('ZB_SCENES video_play');
  quit();
} else if (path.length === 0) {
  console.log('ZB_ERROR no ZB_VIDEO clip');
  quit();
} else {
  const W = width(), H = height();
  const p = new Player(W, H);       // decode at the size it is drawn at
  if (!p.add(path)) { console.log('ZB_ERROR cannot open ' + path); quit(); }
  p.repeat = LOOP;
  p.play();
  let f = 0;
  console.log('ZB_SCENE ' + id + ' ' + W + 'x' + H);
  onFrame((dt: number) => {
    clear(0x000000);
    p.draw(0, 0, W, H);
    if (++f % 30 === 0) console.log('ZB_VIDEO ' + p.decoder + ' frames=' + p.frames + ' dropped=' + p.dropped + ' position=' + p.position);
  });
}
