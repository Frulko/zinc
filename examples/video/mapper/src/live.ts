// A live runtime image: redrawn with zinc:gfx on the CPU every frame, and uploaded by the compositor when its version
// changes (the same path video frames take). Any runtime image can feed a layer.
import * as gfx from 'zinc:gfx';

const SIZE = 256;
export const liveImage = gfx.createImage(SIZE, SIZE);

/** Six orbiting dots and a seconds counter. */
export function paintLiveImage(t: number): void {
  gfx.beginImage(liveImage);
  gfx.clear(0x101828);
  const c = SIZE / 2;
  for (let i = 0; i < 6; i++) {
    const r = 70 + 20 * Math.sin(t * 2 + i);
    gfx.rrect(c + Math.cos(t + i) * r - 14, c + Math.sin(t + i) * r - 14, 28, 28, 14, 0x40a0ff + i * 0x201000, 255);
  }
  gfx.text(92, 116, `${Math.floor(t)}s`, 0xffffff, 3);
  gfx.endImage();
}
