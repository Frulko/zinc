// The manor's plan, shared by the app and the printed sheet: floors, decor, walls and windows, 80 units to a cell, from the current transform's origin.
import { rect, line, image, imageWidth, drawImageRect } from 'zinc:gfx';
import { Puzzle, room, EMPTY } from '../model';
import { neighbors } from '../architecture';
import { inkWindow } from './InkPlan';
// Official room colours, washed toward ivory so the furniture and people carry the eye.
function soften(c: number): number { const m = (s: number): number => Math.round(((c >> s) & 255)*0.5+0xf4*0.5); return (m(16) << 16) | (m(8) << 8) | m(0); }
const FLOOR_COLORS = [soften(0xe4d2b9),soften(0xfeeda6),soften(0xb3fbdd),soften(0xf6b25a)];
// Continuous room boundaries stay distinct from the one-pixel cell grid.
function wall(mono: boolean, x: number, y: number, side: number, window: boolean): void {
 const vertical = side === 1 || side === 3;
 const thickness = 9;
 if (vertical) rect(x-thickness/2,y-thickness/2,thickness,80+thickness,0x000000);
 else rect(x-thickness/2,y-thickness/2,80+thickness,thickness,0x000000);
 if (!window) return;
 if (mono) { inkWindow(x,y,vertical); return; }
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
const art = new Map<string,i32>();   // each atlas loads when its mode first draws
function atlasNamed(name: string): i32 { let id = art.get(name); if (id === undefined) { id = image(name); art.set(name,id); } return id; }
/** `mono` draws the official SVG artwork baked in black and white (authoring/build_assets.py); `shadow` is the drop shadow's offset in units, 0 for none. For paper, `prefix` picks the larger atlases and `inkFloor` lightens the black and white floors. */
export function drawPlan(p: Puzzle, mono: boolean, shadow: number, prefix: string = '', inkFloor: i32 = 255): void {
 const atlas = atlasNamed(prefix+(mono ? 'ink-objects.png' : 'manor-objects.png')), floors = atlasNamed(prefix+(mono ? 'ink-floors.png' : 'manor-floors.png'));
 const t = atlas >= 0 ? imageWidth(atlas)/6 : 0, ft = floors >= 0 ? imageWidth(floors)/4 : 0;
 for (let c = 0; c < p.columns*p.rows; c++) if (room(p,c) >= 0 && shadow > 0) rect(c%p.columns*80+shadow,Math.floor(c/p.columns)*80+shadow,80,80,0xc4c2cc);
 for (let c = 0; c < p.columns*p.rows; c++) {
  const r = room(p,c); if (r < 0) continue;
  const col = c%p.columns, row = Math.floor(c/p.columns), x = col*80, y = row*80;
  const tile = p.themes[r] === 2 ? 1 : p.themes[r] === 7 ? 3 : p.themes[r] === 4 ? 2 : 0;
  const d = p.decor[c];
  if (mono) {
   rect(x,y,80,80,0xffffff);
   if (floors >= 0) drawImageRect(floors,tile*ft,0,ft,ft,x,y,80,80,inkFloor);
   rect(x,y,80,0.8,0x000000); rect(x,y,0.8,80,0x000000);
  } else {
   rect(x,y,80,80,FLOOR_COLORS[r]);
   if (floors >= 0) drawImageRect(floors,tile*ft,0,ft,ft,x,y,80,80,36);
   rect(x,y,80,2,0x3a3a32); rect(x,y,2,80,0x3a3a32);
  }
  if (d !== EMPTY && atlas >= 0) drawImageRect(atlas,(d%6)*t,Math.floor(d/6)*t,t,t,x+2,y+2,76,76,255);
 }
 for (let c = 0; c < p.columns*p.rows; c++) {
  const r = room(p,c); if (r < 0) continue;
  const x = c%p.columns*80, y = Math.floor(c/p.columns)*80, ns = neighbors(p,c);
  for (let s = 0; s < 4; s++) if (room(p,ns[s]) !== r && (ns[s] < 0 || room(p,ns[s]) < 0 || c < ns[s])) {
   wall(mono,x+(s === 1 ? 80 : 0),y+(s === 2 ? 80 : 0),s,(p.windows[c] & (1 << s)) !== 0);
  }
 }
}
