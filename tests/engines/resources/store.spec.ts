import { NativeModule, NativeResource, requireNative } from 'zinc:native';
export interface Spec extends NativeModule {
  create(value: i32): NativeResource;
  alias(value: NativeResource): NativeResource;
  get(value: NativeResource): i32;
  set(value: NativeResource, n: i32): void;
  live(): i32;
}
export default requireNative<Spec>('Store');
