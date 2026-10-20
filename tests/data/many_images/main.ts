// More than 64 runtime images (ZN-670): 1,000 images of 8 x 8 pixels, each filled with its own colour, drawn in a 40 x 25 grid. Then images
// are created until the limit answers -1 (4,096 on a desktop, twice past it: one warning), one is destroyed and created again.
// tests/t1/many_images.sh checks every cell of the frame and the lines printed.
import { onFrame, createImage, destroyImage, beginImage, endImage, drawImage, rect, clear, frame } from 'zinc:gfx';

const N: i32 = 1000;
function color(i: i32): u32 { return (((i * 37) % 256) << 16) | (((i * 91) % 256) << 8) | ((i * 13) % 256); }
const ids: i32[] = [];
for (let i: i32 = 0; i < N; i++) ids.push(createImage(8, 8));
console.log(`created ${ids.filter((id: i32) => id >= 0).length} of ${N}`);
onFrame((dt: number) => {
  if (frame() === 0) for (let i: i32 = 0; i < N; i++) { beginImage(ids[i]); rect(0, 0, 8, 8, color(i)); endImage(); }
  clear(0);
  for (let i: i32 = 0; i < N; i++) drawImage(ids[i], (i % 40) * 8, Math.floor(i / 40) * 8, 8, 8, 255, 0);
  if (frame() === 1) {
    const more: i32[] = [];
    let id = createImage(4, 4);
    while (id >= 0) { more.push(id); id = createImage(4, 4); }
    const again = createImage(4, 4);
    console.log(`limit: ${N + more.length} images, then ${id} and ${again}`);
    destroyImage(more[more.length - 1]);
    const back = createImage(4, 4);
    console.log(`one destroyed: created again ${back >= 0 ? 'yes' : 'no'}`);
  }
});
