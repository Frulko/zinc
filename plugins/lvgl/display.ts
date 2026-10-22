// The computer's display of zinc:lvgl: LVGL renders into an RGBA copy of the screen (native/lvgl.abi.c), shown as one image that is updated
// only when LVGL redrew something. display.esp32.ts is the board's, where LVGL sends its pixels to the panel itself.
import { clear, drawImage, imageFromPixels, keep, updateImage } from 'zinc:gfx';
import L from './native/lvgl.spec';

let image: i32 = -1;
let screenW: i32 = 0;
let screenH: i32 = 0;

export function showDisplay(w: i32, h: i32): void {
  screenW = w;
  screenH = h;
}

export function present(): void {
  const px = L.frame();
  if (px.length === 0 && image >= 0) { keep(); return; }
  if (px.length > 0) {
    if (image < 0) image = imageFromPixels(px, screenW, screenH);
    else updateImage(image, px);
  }
  clear(0x000000);
  if (image >= 0) drawImage(image, 0, 0, screenW, screenH, 255, 0);
}
