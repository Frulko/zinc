// zinc:photos on the fake library (tests/t1/photos.sh, ZINC_FAKE_PHOTOS=<folder>): access, albums with counts, assets newest first and
// paged, a thumbnail and a whole picture as runtime images (the thumbnail is drawn, the test reads its pixels), saves to the library and to
// an album, and the errors a program meets.
import * as gfx from 'zinc:gfx';
import { permissionStatus, requestPermission, albums, assets, loadThumbnail, loadImage, saveImage, savePixels, presentLimitedLibraryPicker, Album, Asset } from 'zinc:photos';

let shown = -1;
gfx.onFrame((_dt: number) => {
  gfx.clear(0x000000);
  if (shown >= 0) gfx.drawImage(shown, 0, 0, gfx.imageWidth(shown), gfx.imageHeight(shown), 255, 0);
});

const line = (l: Album[]): string => l.map((a: Album) => `${a.title}(${a.kind},${a.count})`).join(' ');
const ids = (l: Asset[]): string => l.map((a: Asset) => a.id).join(' ');

async function main(): Promise<void> {
  console.log(`status ${permissionStatus()} add ${permissionStatus('addOnly')}`);
  console.log(`request ${await requestPermission()}`);
  console.log(`albums ${line(await albums())}`);
  const all = await assets('');
  console.log(`all ${ids(all)}`);
  const a = all[0];
  console.log(`first ${a.id} ${a.width}x${a.height} ${a.mediaType} ${a.date > 0} ${a.location === null}`);
  console.log(`page ${ids(await assets('smart:recents', { offset: 1, limit: 2 }))}`);
  console.log(`trips ${ids(await assets('Trips'))}`);
  console.log(`shots ${ids(await assets('smart:screenshots'))}`);
  const thumb = await loadThumbnail(a.id, 32);
  console.log(`thumb ${gfx.imageWidth(thumb)}x${gfx.imageHeight(thumb)}`);
  const full = await loadImage(a.id);
  console.log(`full ${gfx.imageWidth(full)}x${gfx.imageHeight(full)}`);
  gfx.destroyImage(full);
  shown = thumb;
  try { await loadImage('nope.png'); } catch (e) { console.log(`missing ${(e as Error).message}`); }
  const px: u8[] = [];
  for (let i = 0; i < 2 * 3 * 4; i++) px.push(i % 4 === 3 ? 255 : 200);
  console.log(`saved ${await savePixels(px, 2, 3, 'Zinc')}`);
  console.log(`saved ${await savePixels(px, 2, 3, 'Zinc')}`);
  console.log(`zinc ${ids(await assets('Zinc'))}`);
  try { await saveImage([1, 2, 3]); } catch (e) { console.log(`bad ${(e as Error).message}`); }
  console.log(`limited picker ${await presentLimitedLibraryPicker()}`);
  console.log(`albums ${line(await albums())}`);
}
main();
