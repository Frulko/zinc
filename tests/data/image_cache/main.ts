import * as ui from 'zinc:ui';
import { ImageCache, retainCachedImage, releaseCachedImage } from 'zinc:ui/image-cache';
import { createImage, imageWidth } from 'zinc:gfx';
import { exit } from 'zinc:sys';
function check(ok: boolean, message: string): void { if (!ok) { console.log('FAIL ' + message); exit(1); } }
const cache = new ImageCache(256, 2);
const node = ui.createNode(ui.IMAGE), text = ui.createNode(ui.TEXT);
const a = cache.put('a', createImage(8, 8)), b = cache.put('b', createImage(8, 8)), c = cache.put('c', createImage(8, 8));
ui.setImageHandle(node, a);
ui.setText(text, 'x'); ui.setTextRuns(text, [1, ui.pictureRun(8, 8), b]);
retainCachedImage(c); retainCachedImage(c);
cache.trim(0);
check(cache.size === 3 && cache.bytes === 768, 'live working set can exceed budget');
ui.destroy(node); cache.trim(0);
check(cache.get('a') === -1 && cache.size === 2, 'destroyed node releases its cached image');
releaseCachedImage(c); cache.trim(0); check(cache.get('c') === c, 'nested reservation stays live');
releaseCachedImage(c); cache.trim(0); check(cache.get('c') === -1, 'last reservation releases');
ui.setTextRuns(text, []); cache.trim(0); check(cache.size === 0 && cache.bytes === 0, 'inline image releases');
ui.destroy(text);
for (let i = 0; i < 100; i++) {
  const n = ui.createNode(ui.IMAGE);
  const id = cache.put('route-' + i, createImage(8, 8));
  ui.setImageHandle(n, id); cache.trim(0);
  check(cache.size === 1 && cache.bytes === 256 && imageWidth(id) === 8, 'navigation protects displayed image');
  ui.destroy(n); cache.trim(0);
  check(cache.size === 0 && cache.bytes === 0, 'navigation releases previous image');
}
const x = cache.put('x', createImage(8, 8)), y = cache.put('y', createImage(8, 8));
cache.get('x');
const countCache = new ImageCache(4096, 1);
countCache.put('old', createImage(8, 8)); countCache.put('new', createImage(8, 8));
setTimeout(() => {
  cache.trim();
  check(cache.size === 1 && cache.get('x') === x && cache.get('y') === -1, 'byte LRU evicts oldest unused entry');
  check(cache.put('x', createImage(8, 8)) === x, 'duplicate insertion preserves original');
  cache.trim(0);
  check(cache.size === 0, 'unused cache clears');
  countCache.trim(); check(countCache.size === 1 && countCache.get('old') === -1, 'entry limit applies below byte budget');
  countCache.trim(0);
  console.log('image_cache: live nodes, inline images, nested reservations, LRU and 100 navigations pass');
  exit(0);
}, 300);
