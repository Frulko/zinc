import { onFrame, clear, imageFromBytes, startImageDecode, pollImageDecode, imageWidth, quit } from 'zinc:gfx';
import * as fs from 'zinc:fs';
import { env } from 'zinc:sys';

// The longest frame while a big image is decoded: in the frame (imageFromBytes) and beside the frames (startImageDecode, pollImageDecode).
const big = fs.readBytes(env('ZN_BIG'));
let mode = 0;   // 0 warm-up, 1 sync, 2 async
let handle = 0;
let last = performance.now();
let worstAsync = 0;
let syncStall = 0;
let frames = 0;
onFrame((dt: number) => {
  const now = performance.now();
  const gap = now - last;
  last = now;
  clear(0x203040);
  frames++;
  if (mode === 0) {
    if (frames > 20) mode = 1;
  } else if (mode === 1) {
    const t0 = performance.now();
    const id = imageFromBytes(big);
    syncStall = performance.now() - t0;
    if (imageWidth(id) <= 0) { console.log('flat: the sync decode failed'); quit(); }
    mode = 2;
    handle = startImageDecode(big);
    last = performance.now();
  } else {
    if (gap > worstAsync) worstAsync = gap;
    const r = pollImageDecode(handle);
    if (r !== -2) {
      console.log(`flat ${imageWidth(r) > 0 ? 'decoded' : 'failed'} ${worstAsync * 3 < syncStall ? 'flat' : 'STALLED async ' + worstAsync + ' ms, sync ' + syncStall + ' ms'}`);
      quit();
    }
  }
});
