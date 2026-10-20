// A point of interest stays on its direction (ZN-650.09): a dark panorama with a red square at five directions; each frame shows one view
// of VIEWS and prints where PanoramaView.project puts the directions, and tests/t1/museum_panorama.sh finds the red squares there. The
// last three views are those of a visitor at the right, the far and the left side of a table (ZN-650.13): the image is rolled for them,
// and a point is still where it is projected.
import { onFrame, clear, width, height, createImage, beginImage, endImage, rect } from 'zinc:gfx';
import { PanoramaView, direction } from '../../../examples/museum-table/src/panorama';
import { View } from '../../../examples/museum-table/src/project';

const W: i32 = 2048, H: i32 = 1024;
const POINTS: number[][] = [[62, -12], [117, 4], [-113, 27], [0, 0], [-30, -45]];
// yaw, pitch, field of view, side of the table
const VIEWS: number[][] = [[0, 0, 75, 0], [62, -12, 40, 0], [100, 10, 90, 0], [-100, 20, 60, 0], [-20, -30, 50, 0], [62, -12, 40, 1], [100, 10, 90, 2], [-20, -30, 50, 3]];
const img = createImage(W, H);
beginImage(img);
rect(0, 0, W, H, 0x101820);
for (const p of POINTS) rect((0.5 + p[0] / 360) * W - 4, (0.5 - p[1] / 180) * H - 4, 8, 8, 0xff0000);
endImage();
const pano = new PanoramaView(img, new View());
let k: i32 = 0;
onFrame((dt: number) => {
  if (k >= VIEWS.length) return;
  const v = new View();
  v.yaw = VIEWS[k][0]; v.pitch = VIEWS[k][1]; v.fov = VIEWS[k][2];
  pano.set(v);
  pano.side = VIEWS[k][3];
  clear(0x000000);
  pano.draw(0, 0, width(), height());
  for (let i: i32 = 0; i < POINTS.length; i++) {
    const s = pano.project(direction(POINTS[i][0], POINTS[i][1]), 0, 0, width(), height());
    if (s.length > 0 && s[0] >= 0 && s[1] >= 0 && s[0] < width() && s[1] < height()) console.log(`view ${k} point ${i} ${s[0]} ${s[1]}`);
  }
  k++;
});
