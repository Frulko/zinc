// Native side of zinc:qrcode: Nayuki's QR Code generator (vendor/qrcodegen.c) behind one call. qrcode.abi.c implements it on the native ABI
// (include/zn/native.h), with no runtime type: the same C file is the plugin's library on the computer and is compiled into the ESP32's mquickjs
// firmware (firmware/esp32-mquickjs/README.md, "Native code from plugins").
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** The QR code of `text` (UTF-8) at error correction `ecc` (0 low, 1 medium, 2 quartile, 3 high), version `maxVersion` at most: byte 0 is
   *  its side in modules, then each row in ceil(side / 8) bytes, the leftmost module in the high bit. Empty when the text does not fit. */
  encode(text: string, ecc: i32, maxVersion: i32): u8[];
}
export default requireNative<Spec>('Qrcode');
