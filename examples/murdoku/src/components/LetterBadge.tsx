import { puzzle } from '../state';
import { personLetter } from '../puzzle';
import { INK } from '../skin';
const colors = [0xa95e4b,0x40815c,0x3e929d,0x667db8,0x9978a5,0xc0392b];
export function witnessColor(a: number): i32 {
 if (INK) return 0x000000;
 const letter = personLetter(puzzle(),a);
 return colors[letter === 'V' ? 5 : letter.charCodeAt(0)-65];
}
export function LetterBadge(props: { person: number }): i32 {
 return <View style={{ backgroundColor: witnessColor(props.person) }} className="w-[24] h-[24] shrink-0 rounded-[6] items-center justify-center"><Text className="text-[13px] font-bold text-[#ffffff]">{personLetter(puzzle(),props.person)}</Text></View>;
}
// The witness colour washed toward white: the testimony card's tint.
export function witnessTint(a: number): i32 {
 if (INK) return 0xffffff;
 const c = witnessColor(a), m = (s: number): number => Math.round(((c >> s) & 255)*0.14+255*0.86);
 return (m(16) << 16) | (m(8) << 8) | m(0);
}
