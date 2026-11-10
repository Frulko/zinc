import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** Returns mip bytes. Info: transfer, primaries, flags, ETC1, then width/height/byte-count per mip. Error is UTF-8. */
  transcode(data: u8[], etc1: boolean, info: i32[], error: u8[]): u8[];
}
export default requireNative<Spec>('ThreeKTX2');
