// ZN-608: a program that asks for resize events (zinc:gfx onResize; every zinc:ui app does) gets a surface that follows the window; the size
// reaches the callback once per change. ASK=0 asks nothing (a game drawn at fixed coordinates): the surface stays 500 x 300, scaled.
// tests/t1/window_resize.sh runs it as is, without asking, and with zinc.json's choice forced (ZINC_RESIZE=letterbox).
import { onFrame, onResize, clear, width, height } from 'zinc:gfx';
import { env } from 'zinc:sys';
import * as system from 'zinc:system';
import * as window from 'zinc:system/window';

if (env('ASK') !== '0') onResize((w: i32, h: i32): void => console.log('resized to', w, h));
let frame = 0;
onFrame((dt: number) => {
  clear(0x203040);
  frame++;
  if (frame === 3) window.setSize(640, 360);
  if (frame === 12) { console.log('surface', width(), height()); system.quit(0); }
});
