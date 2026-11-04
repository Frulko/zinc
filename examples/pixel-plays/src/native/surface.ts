import { createImage, updatePixels, drawImageRect, destroyImage, ImageFlag, width, height } from 'zinc:gfx';
import { W, H, pix } from './renderer';
import { PixelGame } from './game';

export class PixelSurface {
  image: i32 = -1;
  x: number = 0;
  y: number = 0;
  scale: number = 1;
  private sourceX: number = 0;
  private sourceY: number = 0;
  private sourceWidth: number = W;
  private sourceHeight: number = H;

  /** The renderer's pixels (one u32 each, red in the low byte) go to the image as they are: no per-byte conversion, a quarter of the old array. */
  upload(): void {
    if (this.image < 0) {
      this.image = createImage(W, H);
      if (this.image < 0) throw new Error('Cannot allocate the pixel scene');
    }
    updatePixels(this.image, pix, true);
  }
  /** The runs of pixels that changed (row, first column, last column): the whole array goes in one call now, so there is nothing to convert by run. */
  uploadSpans(_spans: number[]): void { this.upload(); }
  layout(game: PixelGame): void {
    this.sourceX = game.cropX; this.sourceY = game.cropY;
    this.sourceWidth = game.cropWidth; this.sourceHeight = game.cropHeight;
    this.scale = Math.max(1, Math.floor(Math.min(width() / this.sourceWidth, (height() - 150) / this.sourceHeight)));
    this.x = Math.floor((width() - this.sourceWidth * this.scale) / 2);
    this.y = Math.floor((height() - this.sourceHeight * this.scale) / 2);
  }
  draw(): void {
    if (this.image >= 0) drawImageRect(this.image, this.sourceX, this.sourceY, this.sourceWidth, this.sourceHeight, this.x, this.y, this.sourceWidth * this.scale, this.sourceHeight * this.scale, 255, ImageFlag.Nearest);
  }
  sourceXAt(x: number): number { return this.sourceX + (x - this.x) / this.scale; }
  sourceYAt(y: number): number { return this.sourceY + (y - this.y) / this.scale; }
  contains(x: number, y: number): boolean {
    return x >= this.x && x < this.x + this.sourceWidth * this.scale && y >= this.y && y < this.y + this.sourceHeight * this.scale;
  }
  /** The renderer's window changed size: drop the image, it is made again on the next upload. */
  resize(): void { this.dispose(); }
  dispose(): void {
    if (this.image >= 0) destroyImage(this.image);
    this.image = -1;
  }
}
