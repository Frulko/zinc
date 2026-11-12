import { NativeModule, requireNative } from 'zinc:native';
export interface Spec extends NativeModule {
  list(): string;
  open(path: string, hz: i32, mode: i32): i32;
  transfer(h: i32, data: u8[]): u8[];
  write(h: i32, data: u8[]): boolean;
  close(h: i32): void;
  error(): string;
}
export default requireNative<Spec>('SPI');
