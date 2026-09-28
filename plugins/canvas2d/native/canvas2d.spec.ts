// zinc:canvas native side: fills built by the Zinc context go straight to the rasterizer as POLY commands, with the
// even-odd rule or a gradient paint (runtime/raster.cpp paint_at), which zinc:gfx.path does not expose.
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** Fills contours [count, x0, y0, ...]* (screen coordinates). `paint`: [] = the solid `color`, else a gradient
   *  record [kind (1 linear, 2 radial), x0, y0, r0, x1, y1, r1, n, (offset, 0xRRGGBB, alpha 0..255) * n]. */
  fill(contours: number[], color: u32, alpha: i32, evenodd: boolean, paint: number[]): void;
}
export default requireNative<Spec>('Canvas2D');
