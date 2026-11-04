// zinc:imageio on a PNG of a packed app, which zinc pack stored as the fast-load image (tests/t1/imageio_packed.sh, IMAGEIO_FILE=<the file>):
// the header, a thumbnail and a downscaled load, drawn so the test can compare the pixels with the same program on the plain PNG.
import * as gfx from 'zinc:gfx';
import { env } from 'zinc:sys';
import { info, thumbnail, load } from 'zinc:imageio';

const file = env('IMAGEIO_FILE');
let thumb = -1, full = -1;
gfx.onFrame((_dt: number) => {
  gfx.clear(0x404040);
  if (full >= 0) gfx.drawImage(full, 0, 0, gfx.imageWidth(full), gfx.imageHeight(full), 255, 0);
  if (thumb >= 0) gfx.drawImage(thumb, 160, 0, gfx.imageWidth(thumb), gfx.imageHeight(thumb), 255, 0);
});
async function main(): Promise<void> {
  const i = info(file);
  console.log(i === null ? 'info null' : `info ${i.width}x${i.height} ${i.pixelWidth}x${i.pixelHeight} ${i.format} ${i.fileSize > 0}`);
  thumb = await thumbnail(file, 40);
  full = await load(file, 150, 150);
  console.log(`thumbnail ${gfx.imageWidth(thumb)}x${gfx.imageHeight(thumb)} load ${gfx.imageWidth(full)}x${gfx.imageHeight(full)}`);
}
main().catch((e: Error) => console.log('failed ' + e.message));
