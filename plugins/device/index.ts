// zinc:device — small device services for board demos (docs/boards.md#esp32-2432s022).
//
//   import * as device from 'zinc:device';
//   device.setBacklight(0.6);          // 0..1, perceptual (the PWM duty follows level²)
//   device.memory();                   // { zincUsed, zincSize, chipFree, chipMinFree } in bytes (-1: unknown)
//   device.frameMs(); device.drawCmds(); device.chip(); device.cpuMhz(); device.flashSize(); device.idfVersion(); device.firmware();
//
// The backlight is LEDC PWM on the panel's backlight pin: the display driver's (plugins/display-st7789, `bl`) in the AOT firmware, the
// firmware's own under --engine mquickjs (GPIO 0 on the ESP32-2432S022). Where there is none (the computer, sim) the level is only
// remembered: backlight() returns it and hasBacklight() is false. Under mquickjs (native/device.abi.c) the "Zinc heap" of memory() is the
// JavaScript heap of mquickjs (96 KB on the board).
import D from './native/device.spec';

let level: number = 1;
let driven: boolean = false;

/** Sets the backlight, 0 (off) .. 1 (full). */
export function setBacklight(v: number): void {
  level = Math.max(0, Math.min(1, v));
  driven = D.setBacklight(Math.round(level * level * 255));
}
/** Last level set (1 at start). */
export function backlight(): number { return level; }
/** True once a real backlight answered setBacklight(). */
export function hasBacklight(): boolean { return driven; }

/** True when the screen reports touches (always on hosts: the mouse). The ESP32-2432S022N variant has none. */
export function hasTouch(): boolean { return D.hasTouch(); }

/** The touch's map from the controller's pixels to the screen's, x = m[0] rx + m[1] ry + m[2], y = m[3] rx + m[4] ry + m[5]: a calibration,
 *  and a turn or a mirror as well (a panel mounted another way). The board's starts as the one its calibration kept (a finger on the
 *  screen as it starts, docs/boards.md); the identity where the system owns the touch (the computer). */
export function touchMap(): number[] {
  const m: number[] = [];
  for (let i = 0; i < 6; i++) m.push(D.touchMap(i));
  return m;
}
/** Sets the touch's map and keeps it on the board, for the next programs too; false where the system owns the touch (the computer), and for
 *  a map the touch could not use (not finite, or a scale outside 0.5 to 2: one that squeezes or blows up the screen). */
export function setTouchMap(m: number[]): boolean { return D.setTouchMap(m[0], m[1], m[2], m[3], m[4], m[5]); }
/** Restarts the board into its touch calibration, the five crosses a finger held at start shows, then the program again with the new map,
 *  kept for every program. Does not return on the board; false where there is none (the computer, a board without touch). */
export function calibrateTouch(): boolean { return D.calibrateTouch(); }

export class Memory {
  zincUsed: i32 = 0;      // Zinc heap (TLSF) bytes in use; under mquickjs, the JavaScript heap's (-1: unknown)
  zincSize: i32 = 0;      // its size
  chipFree: i32 = -1;     // ESP32 RAM free outside it (-1 on hosts)
  chipMinFree: i32 = -1;  // lowest chipFree since boot
}
export function memory(): Memory {
  const m = new Memory();
  m.zincUsed = D.zincHeapUsed(); m.zincSize = D.zincHeapSize();
  m.chipFree = D.heapFree(); m.chipMinFree = D.heapMinFree();
  return m;
}
/** Zinc heap bytes in use now (cheap: no allocation, fine to sample every frame). */
export function zincHeapUsed(): i32 { return D.zincHeapUsed(); }
/** Duration of the last frame in milliseconds (program, rasterization and transfer to the panel); -1 when unknown (the mquickjs check on the computer). */
export function frameMs(): number { const us = D.frameUs(); return us < 0 ? -1 : us / 1000; }
/** Draw commands of the last painted frame (zinc:gfx's; the AOT esp32 build holds 256 per frame, the mquickjs one 768); -1 when unknown. */
export function drawCmds(): i32 { return D.drawCmds(); }
/** The chip: "ESP32 rev 3.0, 2 cores" (model, revision, cores); a name of the computer elsewhere. */
export function chip(): string { return D.chip(); }
/** CPU clock in MHz, 0 when unknown (emulators). */
export function cpuMhz(): i32 { return D.cpuMhz(); }
/** Size of the flash chip in bytes, -1 when unknown (hosts). */
export function flashSize(): i32 { return D.flashSize(); }
/** The ESP-IDF version the firmware was built with ("v5.5.5"), '' on hosts. */
export function idfVersion(): string { return D.idfVersion(); }
/** The firmware: its name and build as it prints them at start ("zinc-mquickjs 1a2b3c4d"), '' on hosts. */
export function firmware(): string { return D.firmware(); }
