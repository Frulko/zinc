// zinc:script/fast, native side: numbers-only calls across the QuickJS boundary, with no JSON text, no Dyn value and no engine context (next/src/qjs/script_native.cpp,
// module "QuickJSFast"; docs/reports/script-boundary-optimisation.md). Next only: the prototype has no such module.
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** Makes `fn` global `name` of the script h: up to four numbers in (a missing one is 0), one number out. */
  exposeNum(h: i32, name: string, fn: (a: f64, b: f64, c: f64, d: f64) => f64): void;
  /** Calls the function behind handle `ref` (zinc:script's refNamed) with the first n numbers; NaN with failed(h) true when it threw or returned a non-number. */
  callRefNum(h: i32, ref: i32, n: i32, a: f64, b: f64, c: f64, d: f64): f64;
  /** Whether the last callRefNum failed (its error is then in zinc:script's error(h)). */
  failed(h: i32): boolean;
}
export default requireNative<Spec>('QuickJSFast');
