// NAT-01: a native module is a typed spec; `zinc build` generates the C++ interface (zinc_native_sensor.h).
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** Temperature in °C, read from hardware. */
  temperature(): f64;
  /** Hardware identifier. */
  serial(): string;
  setLed(on: boolean): void;
}
export default requireNative<Spec>('Sensor');
