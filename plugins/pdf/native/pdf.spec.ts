// Native side of zinc:pdf: PDFium's C API over document handles (plugins/pdf/index.ts wraps them in a class).
// Page units are PDF points (1/72 in) with the origin at the page's top left, as the page is shown (its /Rotate applied).
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** '' when PDFium is loaded, else why not (where it was looked for). */
  status(): string;
  /** A document handle, or -1 (see error()). */
  open(path: string, password: string): i32;
  /** The last error: PDFium's (wrong password, not a PDF...) or a Zinc-side reason. */
  error(): string;
  pageCount(doc: i32): i32;
  pageWidth(doc: i32, page: i32): f64;
  pageHeight(doc: i32, page: i32): f64;
  /** Draws the rectangle (x, y, w, h) of the page scaled by `scale` (pixels per point; x, y in those pixels) into the runtime image
   *  `img`, made or resized to w x h (-1: a new one). White under the page, its annotations drawn. The image id, -1 on error. */
  render(doc: i32, page: i32, scale: f64, x: f64, y: f64, w: i32, h: i32, img: i32): i32;
  /** Adds one ink annotation to the page: a stroke through points [x, y, ...] in page units, colour 0xRRGGBB, width in points. */
  addInk(doc: i32, page: i32, points: f64[], color: i32, width: f64): boolean;
  /** Writes the document (with the annotations added) as a new PDF file. */
  save(doc: i32, path: string): boolean;
  close(doc: i32): void;
  /** FNV-1a (64 bits, hex) of a runtime image's RGB pixels: what tests compare. */
  hash(img: i32): string;
}
export default requireNative<Spec>('Pdf');
