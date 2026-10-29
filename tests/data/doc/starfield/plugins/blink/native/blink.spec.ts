// zinc:blink native side.
import { NativeModule, requireNative } from 'zinc:native';

/** What the board reports about a pin. */
export interface PinInfo { pin: i32; output: boolean }

export interface Spec extends NativeModule {
  /** A handle, or -1 when the pin cannot drive an LED. */
  open(pin: i32, rate: f64): i32;
  close(h: i32): void;
}
export default requireNative<Spec>('blink');
