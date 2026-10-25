import { drawText, font, rrect } from 'zinc:gfx';
const title = font('sans-bold', 20);
const body = font('sans', 14);
export function drawHud(delivered: boolean): void {
  rrect(20, 20, 480, 106, 14, 0x10232c, 235);
  drawText(title, 38, 35, 'PARCEL YARD', 0xf2d8a3, 255, 0);
  drawText(body, 38, 67, 'Godot-authored world. Zinc-written gameplay.', 0xd8e5e7, 255, 0);
  drawText(body, 38, 92, delivered ? 'Delivered! Gate open. A resets it.' : 'Arrows: move courier. Near gate: A to deliver.', 0x61d6d1, 255, 0);
}
