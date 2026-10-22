// The ESP32's display of zinc:lvgl: LVGL sends its pixels to the panel itself (zn_panel_flush, firmware/esp32-mquickjs/main/main.c), so a
// frame of zinc:gfx has nothing to draw. display.ts is the computer's.
import { keep } from 'zinc:gfx';

export function showDisplay(w: i32, h: i32): void {}
export function originX(): i32 { return 0; }
export function originY(): i32 { return 0; }

export function present(): void { keep(); }
