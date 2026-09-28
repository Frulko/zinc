// One animation, full window: LOTTIE=file.json [LOTTIE_FRAME=n (paused)] zinc run examples/ui/lottie-gallery/view.ts
import * as gfx from 'zinc:gfx';
import { env } from 'zinc:sys';
import * as lottie from 'zinc:lottie';

const name = env('LOTTIE');
const p = new lottie.Player(lottie.load(name.length > 0 ? name : 'LottieLogo1.json'));
const still = env('LOTTIE_FRAME');
if (still.length > 0) p.seek(parseFloat(still)); else p.play();
gfx.onFrame((dt: number) => {
  p.update(dt);
  gfx.clear(0x0f172a);
  p.draw(0, 0, gfx.width(), gfx.height());
});
