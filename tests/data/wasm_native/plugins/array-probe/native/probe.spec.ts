import { NativeModule, requireNative } from 'zinc:native';
export interface Spec extends NativeModule {
  edit(b: u8[], i: i32[], u: u32[], d: number[]): i32[];
  clear(b: u8[], i: i32[], u: u32[], d: number[]): string;
  fail(b: u8[]): void;
  alias(a: i32[], b: i32[]): void;
  doubles(): number[];
  voidValue(): void;
}
export default requireNative<Spec>('ArrayProbe');
