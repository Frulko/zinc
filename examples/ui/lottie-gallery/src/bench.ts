// Lottie benchmark: renders every frame of each animation off screen (gfx.beginImage/endImage) and reports
// ms per frame for evaluation + flattening (vector), rasterization (raster), and a redraw of an unchanged frame
// (replay, what a paused player or a 30 fps file on a 60 Hz loop costs). Release build:
//   zinc run examples/ui/lottie-gallery/src/bench.ts
import * as gfx from 'zinc:gfx';
import { clock } from 'zinc:sys';
import * as lottie from 'zinc:lottie';
import { FILES } from './files';

function bench(file: string, size: i32): void {
  const a = lottie.load(file);
  if (a < 0) { console.log(`${file}: load failed`); return; }
  const img = gfx.createImage(size, size);
  const n: i32 = Math.floor(lottie.frames(a));
  let vec = 0, ras = 0, rep = 0;
  for (let f = 0; f < n; f++) {
    gfx.beginImage(img);
    gfx.rect(0, 0, size, size, 0x0f172a);
    const t0 = clock();
    lottie.draw(a, f, 0, 0, size, size);
    const t1 = clock();
    lottie.draw(a, f, 0, 0, size, size);  // same frame again: layer caches replay their commands
    const t2 = clock();
    gfx.endImage();                        // rasterizes both copies: halve it
    const t3 = clock();
    vec += t1 - t0; rep += t2 - t1; ras += (t3 - t2) / 2;
  }
  console.log(`${file.replace('.json', '').padEnd(24)} ${`${size}`.padStart(4)}px ${`${n}`.padStart(4)} frames  vector ${(vec / n).toFixed(3)}  raster ${(ras / n).toFixed(3)}  total ${((vec + ras) / n).toFixed(3)}  replay ${(rep / n).toFixed(3)} ms/frame`);
  gfx.destroyImage(img);
  lottie.free(a);
}

gfx.onFrame((dt: number) => {
  for (const f of FILES) bench(f, 256);
  bench('LottieLogo1.json', 512);
  bench('TwitterHeart.json', 64);
  bench('skottie_sample_search.json', 48);
  // render-to-image mode: a 48 px icon pre-rendered once, then drawn as a 1:1 copy
  const p = new lottie.Player(lottie.load('skottie_sample_search.json'));
  p.cache(48, 48, 0x0f172a, 1 << 20);
  const target = gfx.createImage(48, 48);
  const n: i32 = Math.floor(p.to);
  for (let f = 0; f < n; f++) { p.seek(f); p.draw(0, 0, 48, 48); }  // fills the atlas (screen commands, discarded)
  const t0 = clock();
  for (let f = 0; f < n; f++) { p.seek(f); gfx.beginImage(target); p.draw(0, 0, 48, 48); gfx.endImage(); }
  console.log(`cached 48px icon: ${((clock() - t0) / n).toFixed(3)} ms/frame (atlas copy)`);
  gfx.quit();
});
