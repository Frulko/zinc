// What the receipt and the A4 sheet share: wrapped text and the portraits, without the app's state.
import { image, imageWidth, imageHeight, drawImageRect, drawText, textWidth, lineHeight } from 'zinc:gfx';
import { Puzzle } from './puzzle';
export function wrap(f: i32, s: string, width: number): string[] {
 const lines: string[] = []; let line = '';
 for (const word of s.replace('« ','« ').replace(' »',' »').split(' ')) {
  const next = line === '' ? word : line+' '+word;
  if (textWidth(f,next,0) > width && line !== '') { lines.push(line); line = word; } else line = next;
 }
 if (line !== '') lines.push(line);
 return lines;
}
/** Draws `s` from x to `right`, returns the y under it. */
export function paragraph(f: i32, s: string, x: number, y: number, right: number): number {
 for (const l of wrap(f,s,right-x)) { drawText(f,x,y,l,0x000000,255,0); y += lineHeight(f); }
 return y;
}
const casts = new Map<string,i32>();
export function portrait(p: Puzzle, a: number, x: number, y: number, size: number, mono: boolean, prefix: string = ''): void {
 const c = p.characters[a], file = prefix+(mono ? 'ink-' : '')+(c.sex === 0 ? 'cast-man.png' : 'cast-woman.png');
 let atlas = casts.get(file); if (atlas === undefined) { atlas = image(file); casts.set(file,atlas); }
 const sw = imageWidth(atlas)/4, sh = imageHeight(atlas)/4;
 drawImageRect(atlas,c.hair*sw,c.skin*sh,sw,sh,x,y,size,size,255);
}
