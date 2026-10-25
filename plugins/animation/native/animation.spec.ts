import { NativeModule, requireNative } from 'zinc:native';
export interface Spec extends NativeModule {
  version(): string;
  error(): string;
  open(data: u8[]): i32;
  close(handle: i32): void;
  clips(handle: i32): string;
  duration(handle: i32, clip: i32): f64;
  vertices(handle: i32): i32;
  joints(handle: i32): i32;
  signature(handle: i32): string;
  color(handle: i32): u32;
  indices(handle: i32): i32[];
  colors(handle: i32): i32[];
  geometry(handle: i32, positions: f64[], normals: f64[]): boolean;
  sample(handle: i32, a: i32, timeA: f64, b: i32, timeB: f64, blend: f64, positions: f64[], normals: f64[]): boolean;
  joint(handle: i32, name: string, matrix: f64[]): boolean;
}
export default requireNative<Spec>('Animation');
