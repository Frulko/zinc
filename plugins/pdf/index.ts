// zinc:pdf — PDF documents on PDFium (docs in plugins/pdf/README.md). Pages render into runtime images (gfx.drawImage,
// drawImageRect); page units are PDF points with the origin at the top left of the page as shown. Native side: native/pdf.spec.ts.
import Pdf from './native/pdf.spec';

/** '' when PDFium is there, else why not (plugins/pdf/vendor/fetch fetches it). */
export function status(): string { return Pdf.status(); }
/** A hash of a runtime image's pixels (what tests compare). */
export function imageHash(img: i32): string { return Pdf.hash(img); }

export class PageSize {
  width: number; height: number;
  constructor(width: number, height: number) { this.width = width; this.height = height; }
}

export class PdfDocument {
  readonly id: i32;
  readonly pageCount: i32;
  constructor(id: i32) { this.id = id; this.pageCount = Pdf.pageCount(id); }

  /** The size of page `page` (0-based) in points. */
  pageSize(page: i32): PageSize { return new PageSize(Pdf.pageWidth(this.id, page), Pdf.pageHeight(this.id, page)); }

  /** Draws the part (x, y, w, h) of the page at `scale` pixels per point into the runtime image `img` (made or resized to w x h; -1: a
   *  new one) and returns it. x, y are pixels of the scaled page: (0, 0, width * scale, height * scale) is the whole page. */
  render(page: i32, scale: number, x: number, y: number, w: i32, h: i32, img: i32 = -1): i32 {
    const id = Pdf.render(this.id, page, scale, x, y, w, h, img);
    if (id < 0) throw new Error('Cannot draw page ' + (page + 1).toString() + ': ' + Pdf.error());
    return id;
  }

  /** Adds an ink annotation through [x, y, ...] (points, top left origin): colour 0xRRGGBB, width in points. */
  addInk(page: i32, points: number[], color: i32, width: number): void {
    if (!Pdf.addInk(this.id, page, points, color, width)) throw new Error(Pdf.error());
  }

  /** Writes the document with the annotations added as a new PDF (through a temporary file). */
  save(path: string): void { if (!Pdf.save(this.id, path)) throw new Error(Pdf.error()); }

  close(): void { Pdf.close(this.id); }
}

/** Opens a PDF; throws with PDFium's reason (not a PDF, wrong password, PDFium missing). */
export function open(path: string, password: string = ''): PdfDocument {
  const id = Pdf.open(path, password);
  if (id < 0) throw new Error(Pdf.error());
  return new PdfDocument(id);
}
