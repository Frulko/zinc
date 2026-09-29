import { NativeModule, requireNative } from 'zinc:native';
export interface Spec extends NativeModule {
  apply(value: i32, callback: (n: i32) => i32): i32;
  keep(callback: (n: i32) => i32): void;
  fire(value: i32): i32;
  clear(): void;
  text(value: string, callback: (s: string) => string): string;
}
export default requireNative<Spec>('Callbacks');
