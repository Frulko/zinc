import { NativeModule, requireNative } from 'zinc:native';
export interface Spec extends NativeModule {
  start(entry: string, paths: string, dispatch: (fn: i32, a: f64, b: f64, c: f64, d: f64, e: f64, s: string) => f64): void;
  invoke(id: i32, a: f64): f64;
  invokeStr(id: i32): string;
}
export default requireNative<Spec>('Pyhost');
