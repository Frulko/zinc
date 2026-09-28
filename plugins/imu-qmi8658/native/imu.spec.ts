// zinc:imu native side: the QMI8658 over I2C (ESP32). Hosts and sim report "no device" and index.ts emulates it.
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** Probes and configures the sensor (pins, address and axis mapping come from the plugin options); false: none. */
  open(): boolean;
  /** Reads one sample; false when the bus fails. */
  read(): boolean;
  /** Last sample: 0..2 accel x/y/z (g), 3..5 gyro x/y/z (degrees/s), both in the board's screen frame; 6 °C. */
  value(i: i32): f32;
}
export default requireNative<Spec>('Imu');
