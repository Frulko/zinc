import { Stage, Sprite, uiState } from 'zinc:stage';
import { rect, line, setTransform, image, drawImageRect } from 'zinc:gfx';
import { puzzle } from '../state';
import { room, EMPTY } from '../puzzle';
import { neighbors } from '../architecture';
import { INK } from '../skin';
import { inkWindow } from './InkPlan';
export const MANOR_BLEED = 20;
// Official room colours, washed toward ivory so the furniture and people carry the eye.
function soften(c: number): number { const m = (s: number): number => Math.round(((c >> s) & 255)*0.5+0xf4*0.5); return (m(16) << 16) | (m(8) << 8) | m(0); }
const FLOOR_COLORS = [soften(0xe4d2b9),soften(0xfeeda6),soften(0xb3fbdd),soften(0xf6b25a)];
// Continuous room boundaries stay distinct from the one-pixel cell grid.
function wall(x: number, y: number, side: number, window: boolean): void {
 const vertical = side === 1 || side === 3;
 const thickness = 9;
 if (vertical) rect(x-thickness/2,y-thickness/2,thickness,80+thickness,0x000000);
 else rect(x-thickness/2,y-thickness/2,80+thickness,thickness,0x000000);
 if (!window) return;
 if (INK) { inkWindow(x,y,vertical); return; }
 // Frames straddle the wall center; only the sill changes to face the room.
 if (vertical) {
  const wx = x-6;
  rect(wx,y+18,12,44,0x454b50);
  rect(wx+1,y+19,10,42,0xf8f3e6);
  rect(wx+3,y+21,6,38,0x9dc6d5);
  rect(wx+3,y+21,2,38,0xd3ebf1);
  rect(wx+1,y+32,10,2,0xf8f3e6); rect(wx+1,y+46,10,2,0xf8f3e6);
  line(wx+4,y+24,wx+7,y+29,0xffffff);
  const sill = side === 3 ? wx+11 : wx-2;
  rect(sill,y+16,3,48,0x70716a); rect(sill,y+18,2,44,0xf8f3e6);
 } else {
  const wy = y-6;
  rect(x+18,wy,44,12,0x454b50);
  rect(x+19,wy+1,42,10,0xf8f3e6);
  rect(x+21,wy+3,38,6,0x9dc6d5);
  rect(x+21,wy+3,38,2,0xd3ebf1);
  rect(x+32,wy+1,2,10,0xf8f3e6); rect(x+46,wy+1,2,10,0xf8f3e6);
  line(x+24,wy+4,x+29,wy+7,0xffffff);
  const sill = side === 0 ? wy+11 : wy-2;
  rect(x+16,sill,48,3,0x70716a); rect(x+18,sill,44,2,0xf8f3e6);
 }
}
class Floor extends Sprite {
 scale = 1;
 private atlas: i32 = -1;
 private floors: i32 = -1;
 override onDraw(w: number, h: number): void {
  setTransform(this.scale,0,0,this.scale,uiState.offsetX+MANOR_BLEED,uiState.offsetY+MANOR_BLEED);
  if (this.atlas < 0) this.atlas = image(INK ? 'ink-objects.png' : 'manor-objects.png');   // the same official SVG artwork; the e-ink skin's is baked in black and white (authoring/build_assets.py)
  if (this.floors < 0) this.floors = image(INK ? 'ink-floors.png' : 'manor-floors.png');
  const p = puzzle();
  const off = 14/this.scale;
  for (let c = 0; c < p.columns*p.rows; c++) if (room(p,c) >= 0 && !INK) rect(c%p.columns*80+off,Math.floor(c/p.columns)*80+off,80,80,0xc4c2cc);
  for (let c = 0; c < p.columns*p.rows; c++) {
   const r = room(p,c); if (r < 0) continue;
   const col = c%p.columns, row = Math.floor(c/p.columns), x = col*80, y = row*80;
   const tile = p.themes[r] === 2 ? 1 : p.themes[r] === 7 ? 3 : p.themes[r] === 4 ? 2 : 0;
   const d = p.decor[c], t = INK ? 192 : 128;
   if (INK) {
    rect(x,y,80,80,0xffffff);
    if (this.floors >= 0) drawImageRect(this.floors,tile*128,0,128,128,x,y,80,80,255);
    rect(x,y,80,0.8,0x000000); rect(x,y,0.8,80,0x000000);
   } else {
    rect(x,y,80,80,FLOOR_COLORS[r]);
    if (this.floors >= 0) drawImageRect(this.floors,tile*128,0,128,128,x,y,80,80,36);
    rect(x,y,80,2,0x3a3a32); rect(x,y,2,80,0x3a3a32);
   }
   if (d !== EMPTY && this.atlas >= 0) drawImageRect(this.atlas,(d%6)*t,Math.floor(d/6)*t,t,t,x+2,y+2,76,76,255);
  }
  for (let c = 0; c < p.columns*p.rows; c++) {
   const r = room(p,c); if (r < 0) continue;
   const x = c%p.columns*80, y = Math.floor(c/p.columns)*80, ns = neighbors(p,c);
   for (let s = 0; s < 4; s++) if (room(p,ns[s]) !== r && (ns[s] < 0 || room(p,ns[s]) < 0 || c < ns[s])) {
    wall(x+(s === 1 ? 80 : 0),y+(s === 2 ? 80 : 0),s,(p.windows[c] & (1 << s)) !== 0);
   }
  }
 }
}
export const manor = new Stage();
const floor = new Floor('manor'); floor.width = 480; floor.height = 480; manor.addChild(floor);
export function drawManor(x: i32,y: i32,w: i32,h: i32): void { floor.width = puzzle().columns*80; floor.height = puzzle().rows*80; floor.scale = (w-2*MANOR_BLEED)/floor.width; manor.drawIn(x,y,w,h); }
