// The plan in black and white (ZN-934): a pattern per room in place of the floor colour, line art in place of the sprites. Coordinates are the plan's
// own 80-unit cells; the canvas scales them. Black ink only, so the panel needs no dither and a mono panel shows the same plan.
import { rect, stroke, rrect } from 'zinc:gfx';
const K = 0x000000, W = 0xffffff;
function seg(x1: number, y1: number, x2: number, y2: number): void { stroke([x1,y1,x2,y2],0.7,K,255,false); }
function poly(pts: number[], closed: boolean = true): void { stroke(pts,1.6,K,255,closed); }
function circle(cx: number, cy: number, r: number): void { const pts: number[] = []; for (let i = 0; i < 12; i++) { pts.push(cx+r*Math.cos(i*Math.PI/6)); pts.push(cy+r*Math.sin(i*Math.PI/6)); } poly(pts); }
function box(x: number, y: number, w: number, h: number): void { poly([x,y,x+w,y,x+w,y+h,x,y+h]); }
/** Room r's floor: 0 diagonal hatch, 1 dots, 2 cross-hatch, 3 vertical stripes, light enough for the people and the decor to read on it. */
export function inkFloor(r: number, x: number, y: number): void {
 rect(x,y,80,80,W);
 if (r === 1) { for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) rect(x+8+i*16,y+8+j*16,2.5,2.5,K); return; }
 if (r === 3) { for (let i = 8; i < 80; i += 14) rect(x+i,y,1,80,K); return; }
 for (let k = 16; k < 160; k += (r === 2 ? 24 : 16)) {
  seg(x+Math.min(k,80),y+Math.max(0,k-80),x+Math.max(0,k-80),y+Math.min(k,80));
  if (r === 2) seg(x+80-Math.min(k,80),y+Math.max(0,k-80),x+80-Math.max(0,k-80),y+Math.min(k,80));
 }
}
/** A window in a wall: a white pane with a cross, straddling the wall. */
export function inkWindow(x: number, y: number, vertical: boolean): void {
 if (vertical) { rect(x-6,y+18,12,44,K); rect(x-4,y+20,8,40,W); rect(x-1,y+20,2,40,K); }
 else { rect(x+18,y-6,44,12,K); rect(x+20,y-4,40,8,W); rect(x+39,y-4,2,8,K); }
}
/** The decor kind d (the order of `objects` in model.ts) as line art on a white tile. */
export function inkDecor(d: number, x: number, y: number): void {
 rrect(x+10,y+10,60,60,6,W,255);
 const o = (a: number): number => a+x+8, p = (a: number): number => a+y+8;
 if (d === 0 || d === 4 || d === 12) { box(o(21),p(38),22,14); poly([o(32),p(8),o(46),p(22),o(32),p(36),o(18),p(22)]); if (d === 4) { rect(o(30),p(18),4,4,K); rect(o(38),p(24),4,4,K); } if (d === 12) seg(o(14),p(20),o(50),p(20)); }
 else if (d === 1) { box(o(14),p(8),36,16); box(o(8),p(24),48,26); }
 else if (d === 2) { box(o(8),p(6),48,52); for (let i = 1; i < 4; i++) seg(o(8),p(6+i*13),o(56),p(6+i*13)); for (let i = 0; i < 4; i++) seg(o(14+i*8),p(10),o(14+i*8),p(19)); }
 else if (d === 3) { box(o(16),p(44),32,12); circle(o(32),p(14),7); poly([o(24),p(24),o(40),p(24),o(38),p(44),o(26),p(44)]); }
 else if (d === 5) { box(o(4),p(12),56,40); box(o(12),p(20),40,24); seg(o(4),p(12),o(12),p(20)); seg(o(60),p(52),o(52),p(44)); }
 else if (d === 6) { box(o(6),p(18),52,26); circle(o(32),p(31),8); seg(o(12),p(44),o(12),p(56)); seg(o(52),p(44),o(52),p(56)); }
 else if (d === 7) { box(o(8),p(10),48,44); box(o(14),p(16),36,32); circle(o(32),p(32),8); seg(o(32),p(32),o(38),p(26)); }
 else if (d === 8) { box(o(4),p(14),56,36); box(o(4),p(36),56,14); for (let i = 1; i < 7; i++) seg(o(4+i*8),p(36),o(4+i*8),p(50)); }
 else if (d === 9) { box(o(8),p(8),48,48); poly([o(32),p(18),o(42),p(36),o(32),p(48),o(22),p(36)]); seg(o(8),p(56),o(56),p(56)); }
 else if (d === 10) { box(o(4),p(10),56,44); box(o(8),p(14),18,12); seg(o(4),p(36),o(60),p(36)); }
 else if (d === 11) { poly([o(4),p(20),o(32),p(46),o(60),p(20)],false); seg(o(4),p(12),o(4),p(52)); seg(o(60),p(12),o(60),p(52)); }
 else if (d === 13) { circle(o(32),p(32),22); seg(o(32),p(32),o(32),p(16)); seg(o(32),p(32),o(44),p(38)); }
 else if (d === 14) { poly([o(32),p(4),o(10),p(56),o(54),p(56)]); box(o(20),p(24),24,18); }
 else if (d === 15) { box(o(10),p(4),44,54); seg(o(32),p(4),o(32),p(58)); rect(o(26),p(30),3,6,K); rect(o(35),p(30),3,6,K); }
 else if (d === 16) { poly([o(10),p(26),o(54),p(26),o(46),p(54),o(18),p(54)]); poly([o(18),p(26),o(24),p(10),o(40),p(10),o(46),p(26)],false); }
 else { box(o(6),p(8),52,44); box(o(12),p(14),40,32); poly([o(12),p(40),o(26),p(26),o(36),p(36),o(42),p(30),o(52),p(40)],false); }
}
