// The sprites a browser draws like the engine (ZN-432, tests/t1/image_rect_wasm.sh): the nearest sprites of main.ts's row() and the pixel-for-texel
// copy, from the baked sheet. A 2D canvas keeps a linear sample inside the source rectangle, where the engine reads the texels around it as a GPU
// does, so the linear sprites are left to main.ts.
import { onFrame, clear, image, imageWidth, imageHeight, drawImageRect, ImageFlag } from 'zinc:gfx';

const sheet = image('sheet.png');
console.log('sheet', imageWidth(sheet), imageHeight(sheet));
const N = ImageFlag.Nearest;
onFrame((dt: number) => {
  clear(0x203040);
  for (let k = 0; k < 2; k++) {   // twice, as main.ts draws the baked and the decoded image: check.py reads both rows
    const y = 8 + k * 40;
    drawImageRect(sheet, 0, 0, 8, 8, 8, y, 32, 32, 255, N);
    drawImageRect(sheet, 0, 0, 8, 8, 48, y, 32, 32, 255, N | ImageFlag.FlipX);
    drawImageRect(sheet, 0, 0, 8, 8, 88, y, 32, 32, 255, N | ImageFlag.FlipY);
    drawImageRect(sheet, 0, 0, 8, 8, 128, y, 32, 32, 255, N | ImageFlag.FlipX | ImageFlag.FlipY);
    drawImageRect(sheet, 16, 0, 8, 8, 168, y, 32, 32, 255, N);
    drawImageRect(sheet, 8, 8, 8, 8, 208, y, 32, 32, 128, N);
    drawImageRect(sheet, 28, 12, 8, 8, 248, y, 32, 32, 255, N);
    drawImageRect(sheet, 8, 0, 8, 8, 288, y, 8, 8);
  }
});
