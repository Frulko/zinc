import C from './native/carplay.spec';
import * as gfx from 'zinc:gfx';

/** A separate decoder for the cluster stream; shares its session's media connection. */
export class SecondaryScreen {
  private decoder: i32 = -1;
  width: i32 = 0;
  height: i32 = 0;
  frames: i32 = 0;
  receive(b: u8[]): boolean {
    if (b[0] === 5) { if (b.length !== 3 || b[2] > 1) return false; if (b[2] === 0) this.close(); return true; }
    if (b[0] === 1) {
      if (b.length < 11 || (b[2] !== 1 && b[2] !== 2)) return false;
      const w = b[3] + b[4] * 256 + b[5] * 65536 + b[6] * 16777216;
      const h = b[7] + b[8] * 256 + b[9] * 65536 + b[10] * 16777216;
      if (w <= 0 || h <= 0 || w > 4096 || h > 4096) return false;
      this.close();
      this.decoder = C.open(b[2], w, h, b.slice(11, b.length - 1));
      if (this.decoder < 0) return false;
      this.width = w; this.height = h; return true;
    }
    if (b[0] === 2 && b.length > 11 && this.decoder >= 0 && C.decode(this.decoder, b.slice(11))) {
      const image = C.image(this.decoder);
      if (image >= 0) { this.width = gfx.imageWidth(image); this.height = gfx.imageHeight(image); }
      this.frames++; return true;
    }
    return false;
  }
  view(x: number, y: number, w: number, h: number): void {
    if (this.decoder < 0 || this.width <= 0 || this.height <= 0) return;
    const image = C.image(this.decoder);
    if (image < 0) return;
    const scale = Math.min(w / this.width, h / this.height);
    gfx.drawImage(image, x + (w - this.width * scale) / 2, y + (h - this.height * scale) / 2,
      this.width * scale, this.height * scale, 255, 0);
  }
  close(): void {
    if (this.decoder >= 0) C.close(this.decoder);
    this.decoder = -1; this.width = 0; this.height = 0; this.frames = 0;
  }
}
