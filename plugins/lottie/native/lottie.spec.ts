// Native side of zinc:lottie: a Lottie (Bodymovin JSON) parser and renderer on the shared rasterizer.
// Animations are handles; plugins/lottie/index.ts wraps them (Player, <Lottie/> component).
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** Parses a Lottie JSON document. Returns a handle, -1 when invalid or when the handle table is full. */
  parse(json: string): i32;
  /** Reads and parses a file; -1 when missing or invalid. */
  open(path: string): i32;
  /** Composition size in its own units (usually px). */
  width(a: i32): f64;
  height(a: i32): f64;
  /** Number of frames (op - ip) and frame rate. */
  frames(a: i32): f64;
  fps(a: i32): f64;
  /** Top-level layers (tests, stats). */
  layers(a: i32): i32;
  /** Draws `frame` (0 = first, fractional allowed) fitted into the box, aspect ratio kept, centered and clipped. */
  draw(a: i32, frame: f64, x: f64, y: f64, w: f64, h: f64, alpha: i32): void;
  free(a: i32): void;
}
export default requireNative<Spec>('Lottie');
