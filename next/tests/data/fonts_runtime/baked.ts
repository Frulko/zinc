// The text of main.ts in fonts written in the program: the baker bakes PublicSans-Medium and sans at 23 px (ZN-669 compares the frames).
import { onFrame, clear, drawText, font, textWidth, lineHeight } from 'zinc:gfx';
import { readText } from 'zinc:assets';

interface Card { font: string; size: number; scale: number; text: string }
const j = JSON.parse(readText('card.json')) as Card;
const face = font('PublicSans-Medium', 23), sans = font('sans', 23);
console.log(`width ${textWidth(face, j.text, 0)}, line ${lineHeight(face)}; sans ${textWidth(sans, j.text, 0)}, line ${lineHeight(sans)}`);
onFrame((dt: number) => {
  clear(0xfaf7f0);
  drawText(face, 12, 20, j.text, 0x1f2937, 255, 0);
  drawText(sans, 12, 70, j.text, 0x7c2d12, 255, 0);
});
