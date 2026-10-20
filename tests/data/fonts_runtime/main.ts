// Fonts at run time (ZN-669): the file, the size and the text come from assets/card.json, read while the program runs, and loadFont rasterizes
// that file at that size. Nothing in this program names the face or a size, so the baker bakes neither (and does not embed the face: it is read
// from the assets). baked.ts draws the same text in fonts written in the program, which the baker bakes; tests/t1/fonts_runtime.sh compares
// the two frames (same pixels). The second line is the engine's sans at the same size.
import { onFrame, clear, drawText, loadFont, textWidth, lineHeight } from 'zinc:gfx';
import { readText } from 'zinc:assets';

interface Card { font: string; size: number; scale: number; text: string }
const j = JSON.parse(readText('card.json')) as Card;
const px = j.size * j.scale;   // 23, computed while the program runs
const face = loadFont(j.font, px), sans = loadFont('sans', px);
console.log(`${face >= 65536 && sans >= 65536 ? 'rasterized at run time' : 'baked'}: width ${textWidth(face, j.text, 0)}, line ${lineHeight(face)}; sans ${textWidth(sans, j.text, 0)}, line ${lineHeight(sans)}`);
onFrame((dt: number) => {
  clear(0xfaf7f0);
  drawText(face, 12, 20, j.text, 0x1f2937, 255, 0);
  drawText(sans, 12, 70, j.text, 0x7c2d12, 255, 0);
});
