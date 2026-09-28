// zinc:map engine (C++): vector tile decoding, style, tile image cache, labels. Used by ../index.ts.
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** Mapbox/MapLibre style JSON (subset). Returns "" or an error message. */
  setStyle(json: string): string;
  /** Zoom range of the tile source (data tiles beyond maxZoom are overzoomed). */
  setSourceZoom(minZoom: i32, maxZoom: i32): void;
  /** Draws the map for a Web Mercator centre (0..1) and zoom into the viewport; returns tiles still loading or rendering.
   *  `fast`: nearest-neighbour scaling while moving. */
  draw(mx: f64, my: f64, zoom: f64, x: f64, y: f64, w: f64, h: f64, fast: boolean): i32;
  /** Next data tile to load, "z/x/y", or "" when none is wanted. */
  nextRequest(): string;
  /** Bytes (uncompressed MVT) of the requested tile "z/x/y"; "" = no tile there (the parent tile is overzoomed). */
  provide(key: string, data: string): void;
  /** Rendering statistics since the last call: "tiles=<n> renderMs=<t> labels=<n>". */
  stats(): string;
}
export default requireNative<Spec>('MapEngine');
