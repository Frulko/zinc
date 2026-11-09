// ZN-1062: a tabular font (OpenType tnum) gives every figure one width; the same family without it keeps Inter's proportional figures.
import { font, tabularFont, textWidth } from 'zinc:gfx';
const plain = font('sans-bold', 40), tab = tabularFont('sans-bold', 40);
const w = (f: i32, s: string): number => textWidth(f, s, 0);
console.log(`plain 1 < 0: ${w(plain, '1') < w(plain, '0')}`);
let same = true;
for (let d = 1; d < 10; d++) if (w(tab, `${d}`) !== w(tab, '0')) same = false;
console.log(`tabular digits equal: ${same}`);
console.log(`tabular clock steady: ${w(tab, '11:11') === w(tab, '00:00')}`);
console.log(`tabular with a fallback glyph steady: ${w(tab, '11:11 ☀') === w(tab, '00:00 ☀')}`);
