// zinc:sf-symbols native side.
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** A white runtime image of the symbol, square, `side` points wide at twice as many pixels; the same one for the same arguments, kept for
   *  the life of the program. -1 for an unknown name, and in a deterministic run: the glyphs depend on the macOS. */
  image(name: string, side: f64, pointSize: f64, weight: f64): i32;
}
export default requireNative<Spec>('Symbols');
