import { NativeModule, requireNative } from 'zinc:native';
export interface Spec extends NativeModule {
  open(codec: i32, config: u8[]): i32;
  decode(handle: i32, packet: u8[]): boolean;
  audioOpen(codec: i32, rate: i32, channels: i32, config: u8[]): i32;
  audioDecode(handle: i32, packet: u8[]): f64[];
  image(handle: i32): i32;
  error(): string;
  close(handle: i32): void;
}
export default requireNative<Spec>('Carplay');
