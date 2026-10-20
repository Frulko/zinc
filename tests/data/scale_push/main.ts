// Every zinc:gfx primitive, a runtime image drawn with beginImage (logical pixels) and a C++ plugin's command (zinc:3d's image), translated
// and clipped: tests/t1/scale_push.sh checks the frames at pixel scales 2 and 4 (ZN-588: zinc:gfx records in physical pixels, plugins are converted).
import { onFrame, clear, rect, rrect, gradient, border, shadow, polygon, path, line, stroke, font, drawText, text, createImage, beginImage, endImage, drawImage, clip, unclip, translate } from 'zinc:gfx';
import { Scene, Camera, Node, Material, cube, render } from 'zinc:3d';

const f = font('sans', 13);
const img = createImage(40, 30);
const scene = new Scene();
const box = scene.add(new Node(cube(1), new Material(0xff8000)));
const camera = new Camera().setPosition(0, 1, 3).lookAt(0, 0, 0);
let t = 0;
onFrame((dt: number) => {
  clear(0x102030);
  rect(4.5, 4.25, 30, 12, 0xff8800);
  rrect(40, 4, 50, 20, 6.5, 0x33cc99, 200);
  gradient(96, 4, 60, 24, 4, 0xee4455, 0x4455ee, true, 255);
  border(162, 4, 50, 24, 5, 2.5, 0xffffff, 230);
  shadow(220, 8, 40, 20, 6, 7.5, 0x000000, 160);
  polygon([10, 40, 60, 46, 30, 80], 0x88dd22, 255);
  path([4, 70, 40, 110, 40, 110, 80, 70, 80, 3, 80, 50, 100, 50, 90, 70], 0x2288dd, 220);
  line(120, 40, 200 + t, 90, 0xffff00);
  stroke([130, 100, 160, 120, 190, 100, 220, 130], 3.5, 0xff44aa, 255, false);
  drawText(f, 8, 120, 'Zinc scale ' + t, 0xffffff, 255, 0.5);
  text(8, 140, 'grid', 0xaaaaaa, 2);
  beginImage(img);
  clear(0x223344);
  rect(5, 5, 20, 10, 0xffcc00);
  polygon([0, 30, 20, 0, 40, 30], 0x66aaff, 180);
  endImage();
  translate(10, 5);
  clip(230, 40, 80, 70, 8);
  drawImage(img, 232, 42, 80, 60, 255, 6);
  unclip();
  translate(0, 0);
  box.setRotation(0.3, t * 0.2, 0);
  render(scene, camera, 240, 130, 70, 50);
  t++;
});
