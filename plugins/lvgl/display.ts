// The computer's display of zinc:lvgl: LVGL renders into an RGBA copy of the screen (native/lvgl.abi.c), shown as one image that is updated
// only when LVGL redrew something, centred in the window (a square window shows a turned display upright, pixel for pixel). display.esp32.ts
// is the board's, where LVGL sends its pixels to the panel itself.
import { clear, destroyImage, drawImage, height, imageFromPixels, keep, updateImage, width } from 'zinc:gfx';
import L from './native/lvgl.spec';

let image: i32 = -1;
let screenW: i32 = 0;
let screenH: i32 = 0;

export function showDisplay(w: i32, h: i32): void {
  if (w === screenW && h === screenH) return;
  screenW = w;
  screenH = h;
  if (image >= 0) destroyImage(image);   // a turned display: a picture of the new size
  image = -1;
}
/** Where the display's top left corner is in the window. */
export function originX(): i32 { return Math.max(0, Math.floor((width() - screenW) / 2)); }
export function originY(): i32 { return Math.max(0, Math.floor((height() - screenH) / 2)); }

export function present(): void {
  const px = L.frame();
  if (px.length === 0 && image >= 0) { keep(); return; }
  if (px.length > 0) {
    if (image < 0) image = imageFromPixels(px, screenW, screenH);
    else updateImage(image, px);
  }
  clear(0x000000);
  if (image >= 0) drawImage(image, originX(), originY(), screenW, screenH, 255, 0);
}
