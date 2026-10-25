import { NativeModule, requireNative } from 'zinc:native';
export interface Spec extends NativeModule {
  count(): i32;
  speed(): i32;
  action(kind: i32, value: i32): void;
}
export default requireNative<Spec>('Warehouse');
