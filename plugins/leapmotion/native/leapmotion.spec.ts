import { NativeModule, requireNative } from 'zinc:native';
export interface Spec extends NativeModule {
  open(): boolean;
  error(): string;
  /** [status (0 waiting, 1 connected, 2 tracking), frame id, fps, hand count, ...88 numbers per hand]. */
  poll(): number[];
  close(): void;
}
export default requireNative<Spec>('LeapMotion');
