// zinc:imageio on the fixtures of tests/data/imageio (tests/t1/imageio.sh, IMAGEIO_DIR=<copy of them>): headers and EXIF, thumbnails and
// downscaled loads turned upright (the loads are drawn, the test reads their pixels), errors, and a burst of requests cancelled.
import * as gfx from 'zinc:gfx';
import { env } from 'zinc:sys';
import { info, thumbnail, load, cancel, ImageInfo } from 'zinc:imageio';

const dir = env('IMAGEIO_DIR');
let tall = -1, wide = -1;
gfx.onFrame((_dt: number) => {
  gfx.clear(0x404040);
  if (tall >= 0) gfx.drawImage(tall, 0, 0, gfx.imageWidth(tall), gfx.imageHeight(tall), 255, 0);
  if (wide >= 0) gfx.drawImage(wide, 30, 0, gfx.imageWidth(wide), gfx.imageHeight(wide), 255, 0);
});

function show(name: string): void {
  const i: ImageInfo | null = info(dir + '/' + name);
  if (i === null) { console.log(`${name} null`); return; }
  const at = i.location === null ? 'nowhere' : `${i.location.latitude.toFixed(4)},${i.location.longitude.toFixed(4)}`;
  console.log(`${name} ${i.width}x${i.height} px ${i.pixelWidth}x${i.pixelHeight} o${i.orientation} ${i.format} ${i.fileSize > 0} '${i.date}' '${i.make}' '${i.model}' '${i.lens}' iso ${i.iso} ${i.exposureTime}s f${i.fNumber} ${i.focalLength}mm ${at}`);
}
const size = (img: number): string => `${gfx.imageWidth(img)}x${gfx.imageHeight(img)}`;

async function main(): Promise<void> {
  show('portrait.jpg');
  show('plain.png');
  show('photo.webp');
  show('notes.txt');
  show('missing.jpg');
  if (env('IMAGEIO_HEIC') !== '') show('photo.heic');
  const t = await thumbnail(dir + '/portrait.jpg', 10);
  console.log(`thumb ${size(t)}`);
  gfx.destroyImage(t);
  tall = await load(dir + '/portrait.jpg');
  console.log(`load ${size(tall)}`);
  wide = await load(dir + '/photo.webp', 100, 100);
  console.log(`webp ${size(wide)}`);
  const small = await load(dir + '/photo.webp', 8, 8);
  console.log(`fitted ${size(small)}`);
  gfx.destroyImage(small);
  try { await thumbnail(dir + '/notes.txt'); } catch (e) { console.log(`bad ${(e as Error).message.split(dir).join('<dir>')}`); }
  // a grid's burst: 40 requests, then the cell scrolled away; every one settles, as a picture or 'cancelled'
  const all: Promise<number>[] = [];
  for (let i = 0; i < 40; i++) all.push(thumbnail(dir + '/plain.png', 64));
  cancel(dir + '/plain.png');
  let pictures = 0, cancelled = 0;
  for (const p of all) {
    try { gfx.destroyImage(await p); pictures++; } catch (e) { if ((e as Error).message === 'cancelled') cancelled++; }
  }
  console.log(`burst ${pictures + cancelled}`);
}
main().catch((e: Error) => console.log(`error ${e.message}`));
