import { NativeModule, requireNative } from 'zinc:native';
export interface Spec extends NativeModule {
  micOpen(codec: i32, rate: i32, channels: i32, samplesPerPacket: i32, bitrate: i32): i32;
  micEncode(handle: i32, samples: f64[]): u8[];
  micClose(handle: i32): void;
  open(codec: i32, width: i32, height: i32, config: u8[]): i32;
  decode(handle: i32, packet: u8[]): boolean;
  audioOpen(codec: i32, rate: i32, channels: i32, config: u8[]): i32;
  audioDecode(handle: i32, packet: u8[]): f64[];
  image(handle: i32): i32;
  nonBlackPixels(handle: i32, x: i32, y: i32, width: i32, height: i32): i32;
  error(): string;
  close(handle: i32): void;
}
export default requireNative<Spec>('Carplay');
