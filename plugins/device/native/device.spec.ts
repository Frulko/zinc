// zinc:device native side: the backlight (through the display driver) and figures only the platform knows.
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** Backlight PWM level 0..255; false when no display driver drives a backlight (hosts, sim). */
  setBacklight(level: i32): boolean;
  /** True when the screen has a touch controller that answered (hosts: the mouse stands in, true). */
  hasTouch(): boolean;
  /** Free bytes of the chip's own heap (internal RAM on ESP32, outside the Zinc heap); -1 on hosts. */
  heapFree(): i32;
  /** Lowest heapFree() since boot; -1 on hosts. */
  heapMinFree(): i32;
  /** Bytes in use / total of the Zinc heap (TLSF); 0 in debug builds. */
  zincHeapUsed(): i32;
  zincHeapSize(): i32;
  /** Duration of the last frame (program + rasterization + transfer), microseconds. */
  frameUs(): i32;
  /** Draw commands of the last painted frame. */
  drawCmds(): i32;
  /** CPU clock in MHz; 0 when unknown. */
  cpuMhz(): i32;
  /** Short chip description ("ESP32 rev 3.0, 2 cores"). */
  chip(): string;
}
export default requireNative<Spec>('Device');
