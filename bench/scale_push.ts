// 200k rectangles a frame, every one moved (ZN-588): at ZINC_SCALE=4 the logical-to-physical conversion of the frame shows in the `diff` phase of ZINC_PROFILE.
//   ZINC_RUN=native ZINC_HEADLESS=1 ZINC_SCALE=4 ZINC_SIZE=320x240 ZINC_FRAMES=200 ZINC_PROFILE=1 zinc run bench/scale_push.ts
import { onFrame, clear, rect, drawText, font } from 'zinc:gfx';

const N = 200000;
const f = font('sans', 12);
let t = 0;
onFrame((dt: number) => {
  clear(0x101820);
  for (let i = 0; i < N; i++) rect((i * 7 + t) % 320, (i * 13) % 240, 2, 2, 0xff8800 + (i & 255));
  drawText(f, 4, 4, 'scale push', 0xffffff, 255, 0);
  t++;
});
