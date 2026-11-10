import { onFrame, clear, image, imageWidth, drawImage } from 'zinc:gfx';
import * as assets from 'zinc:assets';

console.log('math', Math.pow(1, NaN), Math.pow(-0, 3), Math.pow(2, -1074), Math.pow(-1, Infinity), Math.sin(-0));
console.log('before', assets.isLoaded('level'));
let left: i32 = -1, right: i32 = -1;
assets.loadGroup('level', p => { if (p.done === p.total) console.log('loaded', p.done, p.total); }).then(() => {
  left = image('premul.png'); right = image('straight.png');
  console.log('images', imageWidth(left), imageWidth(right), assets.isLoaded('level'));
});
onFrame(() => {
  clear(0x000000);
  if (left >= 0) drawImage(left, 0, 0, 8, 8, 255, 0);
  if (right >= 0) drawImage(right, 8, 0, 8, 8, 255, 0);
});
