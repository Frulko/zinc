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
}
export default requireNative<Spec>('Ink');
