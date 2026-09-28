// zinc:svg engine (C++): parses SVG once into a display list of flattened contours, draws it at any size.
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** Parses an SVG document; returns a handle (>= 0) or -1 (see error()). */
  parse(text: string): i32;
  /** Why the last parse failed. */
  error(): string;
  /** Intrinsic size (width/height attributes, else the viewBox). */
  width(doc: i32): f64;
  height(doc: i32): f64;
  /** Draws into the box with the document's preserveAspectRatio; alpha 0..255. */
  draw(doc: i32, x: f64, y: f64, w: f64, h: f64, alpha: i32): void;
  /** Number of display-list items (shapes after parsing), for diagnostics. */
  items(doc: i32): i32;
  dispose(doc: i32): void;
}
export default requireNative<Spec>('SvgEngine');
