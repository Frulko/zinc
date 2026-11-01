import { image, imageWidth, imageHeight, drawImageRect, rrect } from 'zinc:gfx';
import { Character } from '../characters';
import { puzzle } from '../state';
import { witnessColor } from './LetterBadge';
const atlasNames = ['cast-man.png','cast-woman.png'];
const atlasIds: i32[] = [-1,-1];
export function drawCharacter(c: Character, x: number, y: number, size: number, bg: number = 0xf2f2f7): void {
 if (atlasIds[c.sex] < 0) atlasIds[c.sex] = image(atlasNames[c.sex]);
 const atlas = atlasIds[c.sex]; rrect(x,y,size,size,Math.max(4,size/10),bg,255);
 if (atlas < 0) return;
 const sw = imageWidth(atlas)/4, sh = imageHeight(atlas)/4;
 drawImageRect(atlas,c.hair*sw,c.skin*sh,sw,sh,x+2,y+2,size-4,size-4,255);
}
export function Portrait(props: { person: number; size: number }): i32 {
 return <Canvas style={{ width: props.size, height: props.size, lazy: 1 }} onDraw={(x: i32,y: i32,w: i32,h: i32) => drawCharacter(puzzle().characters[props.person],x,y,Math.min(w,h),witnessColor(props.person))} />;
}
