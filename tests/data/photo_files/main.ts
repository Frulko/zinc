import { onFrame, clear, image, imageWidth, imageHeight, createImage, destroyImage, drawImage, quit } from 'zinc:gfx';
import { resourceStats } from 'zinc:__diagnostics';
import { exit } from 'zinc:sys';
let done = false;
let shown: i32 = -1;
function check(ok: boolean): void { if (!ok) { console.log('photo_files: FAIL'); exit(1); } }
const file = (i: i32): string => i === 99 ? 'p'.repeat(200) + '.jpg' : `p${i}.jpg`;
function draw(): void { drawImage(shown, 4.25, 4.75, 47.3, 31.2, 173, 3.5); }
onFrame(() => {
  clear(0xffffff);
  if (done) { draw(); console.log('photo_files: ' + resourceStats()); quit(); return; }
  done = true;
  const wide = image('wide.jpg'); check(wide >= 0 && imageWidth(wide) === 20000 && imageHeight(wide) === 1);
  const ids: i32[] = [];
  for (let i = 0; i < 100; i++) { const id = image(file(i)); check(id >= 0 && imageWidth(id) === 24 && imageHeight(id) === 16); ids.push(id); }
  for (let i = 0; i < 100; i++) check(image(file(i)) === ids[i]);
  destroyImage(ids[0]);
  const other = createImage(8, 8);
  const reloaded = image('p0.jpg'); check(reloaded >= 0 && reloaded !== other && imageWidth(reloaded) === 24);
  shown = reloaded;
  destroyImage(other);
  check(image('../p0.jpg') === -1 && image('/p0.jpg') === -1);
  draw();
});
