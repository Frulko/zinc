// zinc:device — small device services for board demos (docs/boards.md#esp32-2432s022).
//
//   import * as device from 'zinc:device';
//   device.setBacklight(0.6);          // 0..1, perceptual (the PWM duty follows level²)
//   device.memory();                   // { zincUsed, zincSize, chipFree, chipMinFree } in bytes (-1: unknown)
//   device.frameMs(); device.drawCmds(); device.chip(); device.cpuMhz();
//
// The backlight goes through the display driver (plugins/display-st7789: LEDC PWM on its `bl` pin). Where there is
// none (the macOS emulator, sim) the level is only remembered: backlight() returns it and hasBacklight() is false.
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

export class Memory {
  zincUsed: i32 = 0;      // Zinc heap (TLSF) bytes in use
  zincSize: i32 = 0;      // Zinc heap size
  chipFree: i32 = -1;     // ESP32 internal RAM free outside the Zinc heap (-1 on hosts)
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
/** Duration of the last frame in milliseconds (program, rasterization and transfer to the panel). */
export function frameMs(): number { return D.frameUs() / 1000; }
/** Draw commands of the last painted frame (the esp32 build holds 256 per frame). */
export function drawCmds(): i32 { return D.drawCmds(); }
export function chip(): string { return D.chip(); }
/** CPU clock in MHz, 0 when unknown (emulators). */
export function cpuMhz(): i32 { return D.cpuMhz(); }
