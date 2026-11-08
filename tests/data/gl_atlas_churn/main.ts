// The GL replay's glyph atlas under churn (ZN-182): 200 different characters at four sizes a frame, the sizes moving every frame, so with
// small pages (ZINC_GL_ATLAS=128 in tests/t1/gl_atlas_churn.sh) the atlas fills, grows to its four pages and evicts pages in the middle of
// a frame. The last frame must still match the software raster.
import { onFrame, clear, drawText, loadFont } from 'zinc:gfx';

let chars = '';
for (let c = 0x21; c < 0x7f; c++) chars += String.fromCharCode(c);    // 94
for (let c = 0xa1; c < 0x100; c++) chars += String.fromCharCode(c);   // 95
for (let c = 0x100; c < 0x10b; c++) chars += String.fromCharCode(c);  // 11: 200 in all
const fonts: i32[] = [];
for (let px = 8; px < 32; px++) fonts.push(loadFont('sans', px));
let frame = 0;

onFrame((dt: number) => {
  clear(0xffffff);
  let y = 2;
  for (let k = 0; k < 4; k++) {
    const n = (frame * 5 + k * 6) % fonts.length;
    for (let i = 0; i < chars.length; i += 40) {
      drawText(fonts[n], 4, y, chars.substring(i, i + 40), 0x102030, 255, 0);
      y += 2 + Math.ceil((8 + n) * 1.25);
    }
  }
  frame++;
});
