// zinc:device native side: the backlight (through the display driver) and figures only the platform knows. device.host.cpp on the computer
// (zinc's engines), device.esp32.cpp in the AOT firmware, device.abi.c on the native ABI in the mquickjs firmware and in its check on the computer.
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** Backlight PWM level 0..255; false when no display driver drives a backlight (hosts, sim). */
  setBacklight(level: i32): boolean;
  /** True when the screen has a touch controller that answered (hosts: the mouse stands in, true). */
  hasTouch(): boolean;
  /** Coefficient `i` (0..5) of the touch's map from the controller's pixels to the screen's: x = m0 rx + m1 ry + m2, y = m3 rx + m4 ry + m5;
   *  the identity where the system owns the touch (hosts). */
  touchMap(i: i32): f64;
  /** Sets the touch's map and keeps it on the board; false where the system owns the touch (hosts). */
  setTouchMap(a: f64, b: f64, c: f64, d: f64, e: f64, f: f64): boolean;
  /** Restarts the board into its touch calibration (the crosses to tap), then the program again; false where there is none (hosts, no touch). */
  calibrateTouch(): boolean;
  /** Turns the board off (deep sleep, screen and touch asleep) until its reset or the battery's power button; false where it cannot (hosts). */
  powerOff(): boolean;
  /** Free bytes of the chip's own heap (internal RAM on ESP32, outside the Zinc heap); -1 on hosts. */
  heapFree(): i32;
  /** Lowest heapFree() since boot; -1 on hosts. */
  heapMinFree(): i32;
  /** Bytes in use / total of the Zinc heap (TLSF; 0 in debug builds), of the JavaScript heap under mquickjs; -1 when unknown. */
  zincHeapUsed(): i32;
  zincHeapSize(): i32;
  /** Duration of the last frame (program + rasterization + transfer), microseconds; -1 when unknown. */
  frameUs(): i32;
  /** Draw commands of the last painted frame; -1 when unknown. */
  drawCmds(): i32;
  /** CPU clock in MHz; 0 when unknown. */
  cpuMhz(): i32;
  /** Short chip description ("ESP32 rev 3.0, 2 cores"). */
  chip(): string;
  /** Size of the flash chip in bytes; -1 when unknown (hosts). */
  flashSize(): i32;
  /** The ESP-IDF version the firmware was built with ("v5.5.5"); '' on hosts. */
  idfVersion(): string;
  /** The firmware's name and build, as it prints them at start ("zinc-mquickjs 1a2b3c4d"); '' on hosts. */
  firmware(): string;
}
export default requireNative<Spec>('Device');
