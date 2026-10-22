// Native side of zinc:sketch: what the sketch (sketch.abi.cpp, C++ on Arduino's core) shows TypeScript.
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** How many times the board has started: a counter Arduino's Preferences keeps in the flash (NVS). */
  boots(): i32;
  /** The chip, from Arduino's ESP class: its model and clock. */
  chip(): string;
  /** Arduino's millis(): milliseconds since the board started. */
  millis(): i32;
  /** How many times the sketch's loop() has run (the firmware calls it once per frame). */
  loops(): i32;
  /** The free heap of the whole board in bytes (ESP.getFreeHeap()). */
  freeHeap(): i32;
}
export default requireNative<Spec>('Sketch');
