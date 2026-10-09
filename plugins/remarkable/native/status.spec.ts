import { NativeModule, requireNative } from 'zinc:native';
export interface Spec extends NativeModule {
  battery(): i32;
  charging(): boolean;
  localMinutes(): i32;
}
export default requireNative<Spec>('RemarkableStatus');
