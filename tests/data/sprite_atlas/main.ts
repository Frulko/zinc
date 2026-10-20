// The sprite_atlas test (tests/t1/sprite_atlas.sh, ZN-438): prints the tables of the two atlases and where animations stand, then draws
// each loose image (left half) and its frame of the atlas (right half) at whole and fractional positions (drawImage) and scaled by 1.5
// (drawImageRect of the whole image), and the frames of the sheet and of the Aseprite file below on the right (`at` lines: where).
// Without packs (ZINC_PACKS=""), the frames are the images.
import { onFrame, clear, image, drawImage, drawImageRect, imageWidth, imageHeight } from 'zinc:gfx';
import { atlas, Atlas } from 'zinc:sprite';

const sprites = atlas('sprites'), small = atlas('small');
function show(a: Atlas): void {
  console.log(`atlas ${a.name}: ${a.pages.length} page(s)`);
  for (const p of a.pages) console.log(`  page ${imageWidth(p)}x${imageHeight(p)}`);
  for (const f of a.frames)
    console.log(`  frame ${f.name} ${f.x},${f.y} ${f.w}x${f.h} at ${f.ox},${f.oy} of ${f.width}x${f.height} scale ${f.scale} pivot ${f.pivotX},${f.pivotY} ${f.duration} ms`);
  for (const an of a.animations) {
    let names = '';
    for (const f of an.frames) names += ' ' + f.name;
    let at = '';
    for (const t of [0, 120, 260, 500]) at += ` ${t}:${an.frameAt(t, true).name}`;
    console.log(`  animation ${an.name} ${an.mode}${names}: ${an.duration()} ms,${at}, once ${an.frameAt(100000, false).name}`);
  }
}
show(sprites);
show(small);

const loose = ['sprites/dot.png', 'sprites/hero.png', 'sprites/walk_1.png', 'sprites/walk_2.png', 'sprites/ship.svg'];
const xs = [4, 24, 40, 52, 64];
const below = ['gem.png', 'arrow.png', 'sprites/blink.aseprite#0', 'sprites/blink.aseprite#1', 'sprites/blink.aseprite#2'];
const bx = [4, 16, 28, 40, 52];
const H = 128;   // the right half
if (sprites.pages.length > 0) for (let i = 0; i < below.length; i++) console.log(`at ${below[i]} ${H + bx[i]} 72`);

onFrame((dt: number) => {
  clear(0x202020);
  for (let i = 0; i < loose.length; i++) {
    const im = image(loose[i]), f = sprites.frame(loose[i]);
    const w = imageWidth(im), h = imageHeight(im), x = xs[i];
    drawImage(im, x, 4, w, h, 255, 0);
    f.draw(H + x, 4);
    drawImage(im, x + 0.37, 24.61, w, h, 255, 0);
    f.draw(H + x + 0.37, 24.61);
    drawImageRect(im, 0, 0, w, h, x, 44, w * 1.5, h * 1.5);   // scaled: the sprite path of both (drawImage weighs texels in another float order)
    f.draw(H + x, 44, w * 1.5, h * 1.5);
  }
  if (sprites.pages.length > 0) for (let i = 0; i < below.length; i++) sprites.frame(below[i]).draw(H + bx[i], 72);
});
