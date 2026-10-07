// The first decoded frame of a clip (ZN-109): VIDEO_FILE is decoded, the first frame is drawn 1:1 on a black screen and saved to VIDEO_SHOT; the pixels must equal the prototype's build.
import { onFrame, clear, drawImage, capture, quit } from 'zinc:gfx';
import { Player } from 'zinc:video';
import * as sys from 'zinc:sys';

const p = new Player(0, 0);
p.add(sys.env('VIDEO_FILE'));
p.play();
let shown = 0;
onFrame((dt: number) => {
  clear(0x000000);
  if (p.frames < 1 || p.image < 0) return;
  drawImage(p.image, 0, 0, p.width, p.height, 255, 0);
  if (++shown >= 2) { console.log('decoder', p.decoder, p.width, p.height); capture(sys.env('VIDEO_SHOT')); quit(); }
});
