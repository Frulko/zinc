import * as ui from 'zinc:ui';
import { openImageViewer, closeImageViewer } from 'zinc:ui/kit';
import { createImage, imageWidth, quit } from 'zinc:gfx';
import { exit } from 'zinc:sys';
import { ImageCache } from 'zinc:ui/image-cache';
const cache = new ImageCache(0);
const thumbnail = cache.put('thumbnail', createImage(20, 20)), next = cache.put('next', createImage(30, 30));
const root = ui.createNode(ui.VIEW);
ui.mount(root, 0x112233, null);
let copy: i32 = -1, stale: i32 = -1;
const wait = (ms: number): Promise<void> => new Promise<void>((resolve: () => void) => { setTimeout(resolve, ms); });
function check(ok: boolean, what: string): void { if (!ok) { console.log('FAIL ' + what); exit(1); } }
async function run(): Promise<void> {
  for (let i = 0; i < 3; i++) {
    openImageViewer({ items: [{ image: thumbnail, width: 20, height: 20, sharper: (): Promise<i32> => {
      copy = createImage(80, 80); return Promise.resolve(copy);
    } }, { image: next, width: 30, height: 30, sharper: (): Promise<i32> => {
      copy = createImage(90, 90); return Promise.resolve(copy);
    } }], index: 0 });
    await wait(80);
    check(copy >= 0 && imageWidth(copy) === 80, 'displayed sharper copy stays alive');
    cache.trim(0);
    check(imageWidth(next) === 30, 'viewer reserves its next thumbnail outside UI nodes');
    ui.sendKey('ArrowRight'); await wait(250);
    check(imageWidth(copy) === 90, 'next sharper image displays');
    closeImageViewer();
    await wait(320);
    check(imageWidth(copy) === 0, 'closing releases sharper copy');
    check(imageWidth(thumbnail) === 20, 'thumbnail stays caller-owned');
  }
  openImageViewer({ items: [{ image: thumbnail, width: 20, height: 20, sharper: (): Promise<i32> => new Promise<i32>((resolve: (image: i32) => void) => {
    setTimeout(() => { stale = createImage(90, 90); resolve(stale); }, 100);
  }) }], index: 0 });
  closeImageViewer();
  await wait(180);
  check(stale >= 0 && imageWidth(stale) === 0, 'late completion after closing is released');
  await wait(160);
  cache.trim(0); check(cache.size === 0, 'closing releases thumbnail reservations');
  console.log('viewer_lifetime: displayed and stale sharper copies released; thumbnail preserved');
  quit();
}
setTimeout(() => { run(); }, 10);
