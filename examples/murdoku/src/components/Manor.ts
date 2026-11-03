import { Stage, Sprite, uiState } from 'zinc:stage';
import { setTransform } from 'zinc:gfx';
import { puzzle } from '../state';
import { INK, bw } from '../skin';
import { drawPlan } from './plan';
export const MANOR_BLEED = 20;
class Floor extends Sprite {
 scale = 1;
 override onDraw(w: number, h: number): void {
  setTransform(this.scale,0,0,this.scale,uiState.offsetX+MANOR_BLEED,uiState.offsetY+MANOR_BLEED);
  drawPlan(puzzle(),bw(),INK ? 0 : 14/this.scale);
 }
}
export const manor = new Stage();
const floor = new Floor('manor'); floor.width = 480; floor.height = 480; manor.addChild(floor);
export function drawManor(x: i32,y: i32,w: i32,h: i32): void { floor.width = puzzle().columns*80; floor.height = puzzle().rows*80; floor.scale = (w-2*MANOR_BLEED)/floor.width; manor.drawIn(x,y,w,h); }
