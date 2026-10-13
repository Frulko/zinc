import { NativeModule, requireNative } from 'zinc:native';
export interface Spec extends NativeModule {
  open(): boolean;
  error(): string;
  /** [status, revision, mean fps, hands, devices, ...[device id, status, frame, fps, count, ...93 numbers/hand]]. */
  poll(): number[];
  deviceSerial(id: i32): string;
  close(): void;
}
export default requireNative<Spec>('LeapMotion');
