import { NativeModule, requireNative } from 'zinc:native';
export interface Spec extends NativeModule {
  list(): string;
  open(path: string, address: i32): i32;
  readRegister(h: i32, reg: i32, count: i32): u8[];
  scan(path: string, policy: string): i32[];
  write(h: i32, data: u8[]): boolean;
  close(h: i32): void;
  error(): string;
}
export default requireNative<Spec>('I2C');
