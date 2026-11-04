// Rounded pictures (zinc:gfx drawImage with a radius): the pixels well inside the box skip the corner test, and must come out as before.
// tests/t0/rounded_image.sh compares this frame's hash (recorded with the engine that tested every pixel). Several sizes, radii,
// alphas and fractional positions, the picture at its own size (a row copy), scaled up and scaled down, and a radius larger than the box.
import { onFrame, clear, createImage, beginImage, endImage, gradient, rrect, drawImage, quit } from 'zinc:gfx';

const src = createImage(64, 48);
beginImage(src);
gradient(0, 0, 64, 48, 0, 0x2060d0, 0xe0a030, true, 255);
rrect(10, 8, 30, 20, 6, 0xd02050, 255);
endImage();
const same = createImage(100, 100);
beginImage(same);
gradient(0, 0, 100, 100, 0, 0x30c070, 0x601090, false, 255);
rrect(20, 20, 60, 60, 30, 0xffffff, 255);
endImage();

let n = 0;
onFrame(() => {
  n++;
  clear(0x303840);
  drawImage(same, 10, 10, 100, 100, 255, 14);        // its own size: a row copy inside, the corners tested
  drawImage(same, 120.5, 10.25, 100, 100, 255, 14);   // a fractional position
  drawImage(same, 230, 10, 100, 100, 128, 20);        // translucent
  drawImage(same, 340, 10, 100, 100, 255, 50);        // a circle
  drawImage(same, 450, 10, 100, 100, 255, 80);        // a radius larger than the box
  drawImage(src, 10, 120, 160, 120, 255, 12);         // scaled up
  drawImage(src, 180, 120, 31, 23, 255, 6);           // scaled down, small
  drawImage(src, 230, 120, 33.5, 90.25, 255, 9);      // a stretched fractional box
  drawImage(src, 280, 120, 90, 90, 200, 2);           // a small radius
  drawImage(src, 380, 120, 200, 40, 255, 20);         // a wide thin box
  drawImage(src, 540, 120, 40, 200, 255, 20);         // a tall thin box
  drawImage(same, 10, 250, 100, 100, 255, 0);         // no radius: untouched
  drawImage(same, -30, 250, 100, 100, 255, 14);       // clipped by the screen's left edge
  drawImage(same, 560, 330, 100, 100, 255, 14);       // clipped by the right and bottom edges
  if (n === 3) quit();
});
