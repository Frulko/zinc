// Viewer: one animation, full window, on the light page colour.
//   LOTTIE=file.json            the animation (default LottieLogo1.json)
//   LOTTIE_FRAME=n              show frame n, paused
//   LOTTIE_CACHE=1              render-to-image mode (Player.cache)
//   zinc run examples/ui/lottie-gallery/src/view.ts
import * as gfx from 'zinc:gfx';
import { env } from 'zinc:sys';
import * as lottie from 'zinc:lottie';

const name = env('LOTTIE');
const p = new lottie.Player(lottie.load(name.length > 0 ? name : 'LottieLogo1.json'));
const still = env('LOTTIE_FRAME');
if (still.length > 0) p.seek(parseFloat(still)); else p.play();
if (env('LOTTIE_CACHE').length > 0) p.cache(gfx.width(), gfx.height(), 0xfafafa, 256 << 20);
gfx.onFrame((dt: number) => {
  p.update(dt);
  gfx.clear(0xfafafa);
  p.draw(0, 0, gfx.width(), gfx.height());
});
