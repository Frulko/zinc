import { NativeModule, requireNative } from 'zinc:native';
export interface Sample { value: i32; label: string; ready: boolean }
export interface Spec extends NativeModule {
  sample(value: i32): Sample;
}
export default requireNative<Spec>('Samples');
