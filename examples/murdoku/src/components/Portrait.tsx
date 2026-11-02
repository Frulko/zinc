import { image, imageWidth, imageHeight, drawImageRect, rrect } from 'zinc:gfx';
import { Character } from '../characters';
import { puzzle } from '../state';
import { witnessColor } from './LetterBadge';
import { personLetter } from '../puzzle';
import { INK, bw } from '../skin';
const atlasNames = ['cast-man.png','cast-woman.png','ink-cast-man.png','ink-cast-woman.png'];   // colour, then black and white
const atlasIds: i32[] = [-1,-1,-1,-1];
export function drawCharacter(c: Character, x: number, y: number, size: number, bg: number = 0xf2f2f7): void {
 const k = c.sex + (bw() ? 2 : 0);
 if (atlasIds[k] < 0) atlasIds[k] = image(atlasNames[k]);
 const atlas = atlasIds[k]; rrect(x,y,size,size,Math.max(4,size/10),bw() ? 0xffffff : bg,255);
 if (atlas < 0) return;
 const sw = imageWidth(atlas)/4, sh = imageHeight(atlas)/4;
 drawImageRect(atlas,c.hair*sw,c.skin*sh,sw,sh,x+2,y+2,size-4,size-4,255);
}
export function Portrait(props: { person: number; size: number }): i32 {
 // E-ink: the official bust in black and white, the letter as a black badge in its corner (the letter is what the pen and the testimonies name).
 if (INK) return <View style={{ width: props.size, height: props.size }} className="rounded-[6] border-[2] border-black bg-white overflow-hidden"><Canvas style={{ width: props.size, height: props.size, lazy: 1 }} onDraw={(x: i32,y: i32,w: i32,h: i32) => drawCharacter(puzzle().characters[props.person],x,y,Math.min(w,h),witnessColor(props.person))} /><View style={{ backgroundColor: witnessColor(props.person) }} className="absolute top-0 left-0 w-[18] h-[18] rounded-br-[5] items-center justify-center"><Text className="text-[11px] font-bold text-white">{personLetter(puzzle(),props.person)}</Text></View></View>;
 return <Canvas style={{ width: props.size, height: props.size, lazy: 1 }} onDraw={(x: i32,y: i32,w: i32,h: i32) => drawCharacter(puzzle().characters[props.person],x,y,Math.min(w,h),witnessColor(props.person))} />;
}
