// Native side of zinc:ink's recogniser: the point-cloud matcher in C++ (ink.abi.cpp, on the native ABI), the same algorithm as
// recog.ts, the TypeScript reference. A stroke list crosses as flat x, y pairs (`pts`) and the point count of each stroke (`lens`).
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** Forgets every template. */
  reset(): void;
  /** Adds a template: the strokes of one handwritten example of `label`. */
  add(label: string, pts: f64[], lens: i32[]): void;
  /** How many templates are loaded. */
  count(): i32;
  /** The distance of the strokes to each class of `classes` (comma separated, '' for every class), best first, as "label distance;label distance". */
  match(pts: f64[], lens: i32[], classes: string): string;
  /** match() on a worker thread; the result is delivered on the UI thread. */
  matchAsync(pts: f64[], lens: i32[], classes: string): Promise<string>;
  /** Loads the int8 letter net (a .znm): its class count, -1 when the bytes are not a model. */
  netLoad(bytes: u8[]): i32;
  /** netLoad of the base64 text of a .znm. */
  netLoadB64(text: string): i32;
  /** The labels of the loaded net, comma separated ('' without one). */
  netLabels(): string;
  /** The scale of the int8 logits (a logit is q * scale). */
  netScale(): f64;
  /** The 3 x 24 x 24 int8 raster of the strokes, as ints. */
  netRaster(pts: f64[], lens: i32[]): i32[];
  /** The int8 logits of a raster, "l0 l1 ... ". */
  netLogits(raster: i32[]): string;
  /** Raster and logits of the strokes. */
  netRun(pts: f64[], lens: i32[]): string;
  /** netRun on a worker thread. */
  netRunAsync(pts: f64[], lens: i32[]): Promise<string>;
}
export default requireNative<Spec>('Ink');
