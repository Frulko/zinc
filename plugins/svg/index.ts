// zinc:svg: runtime SVG rendering. The document is parsed once (C++) into a display list of flattened contours and
// drawn through the shared vector rasterizer at any position and size. Supported subset: docs/plugins/svg.md.
import Engine from './native/svg.spec';

export class Svg {
  /** False when the text could not be parsed; `error` says why. */
  readonly ok: boolean;
  readonly error: string;
  /** Intrinsic size (width/height attributes, else the viewBox). */
  readonly width: number;
  readonly height: number;
  private doc: i32;

  constructor(text: string) {
    this.doc = Engine.parse(text);
    this.ok = this.doc >= 0;
    this.error = this.ok ? '' : Engine.error();
    this.width = this.ok ? Engine.width(this.doc) : 0;
    this.height = this.ok ? Engine.height(this.doc) : 0;
  }
  /** Draws into the box (x, y, w, h) honouring preserveAspectRatio; alpha 0..255. */
  draw(x: number, y: number, w: number, h: number, alpha: i32): void {
    if (this.doc >= 0) Engine.draw(this.doc, x, y, w, h, alpha);
  }
  /** Shapes in the display list. */
  items(): i32 { return this.doc >= 0 ? Engine.items(this.doc) : 0; }
  dispose(): void {
    if (this.doc >= 0) Engine.dispose(this.doc);
    this.doc = -1;
  }
}
