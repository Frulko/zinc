// zinc:gfx/msdf — text drawn from the MSDF atlas of a font rule with "sdf": "msdf" (ZN-442, the font importer of src/assets/font.h): one
// atlas page drawn at any size and under any matrix keeps its edges one pixel wide, where a baked or rasterized font is resampled. Each
// glyph is one drawImageRect with ImageFlag.Msdf, so a GL display batches a label into one draw.
//   const title = MsdfFont.load('fonts/Display.ttf');   // the font's pack entries fonts/Display.ttf.msdf and .msdf.json
//   title.draw('Level 1', 20, 40, 96, 0xffffff);         // 96 px, white, its top at y 40
import { drawImageRect, image, ImageFlag } from 'zinc:gfx';
import { readText, exists } from 'zinc:assets';

interface Table { size: number; range: number; ascent: number; descent: number; lineGap: number; width: number; height: number; glyphs: number[][] }

export class MsdfFont {
  private constructor(public readonly size: number, public readonly ascent: number, public readonly descent: number, public readonly lineGap: number,
                      private readonly atlas: i32, private readonly glyphs: Map<number, number[]>) {}

  /** The atlas the build made for the font asset `name` (its packs, or a dev run's); null when it made none (no "sdf": "msdf" rule). */
  static load(name: string): MsdfFont | null {
    if (!exists(name + '.msdf.json')) return null;
    const atlas = image(name + '.msdf');
    if (atlas < 0) return null;
    const t: Table = JSON.parse(readText(name + '.msdf.json'));
    const glyphs = new Map<number, number[]>();
    for (const g of t.glyphs) glyphs.set(g[0], g);
    return new MsdfFont(t.size, t.ascent, t.descent, t.lineGap, atlas, glyphs);
  }

  /** The distance from one baseline to the next at `px` pixels. */
  lineHeight(px: number): number { return (this.ascent + this.descent + this.lineGap) * px / this.size; }

  /** The width of `text` at `px` pixels (no kerning). */
  width(text: string, px: number): number {
    let w = 0;
    for (let i = 0; i < text.length; i++) {
      const cp = text.codePointAt(i);
      if (cp > 0xffff) i++;
      const g = this.glyphs.get(cp);
      if (g !== undefined) w += g[7];
    }
    return w * px / this.size;
  }

  /** Draws `text` at `px` pixels with its top at (x, y), in `color` (0xRRGGBB); a character the charset left out is skipped. */
  draw(text: string, x: number, y: number, px: number, color: u32, alpha: i32 = 255): void {
    const k = px / this.size, base = y + this.ascent * k;
    let pen = x;
    for (let i = 0; i < text.length; i++) {
      const cp = text.codePointAt(i);
      if (cp > 0xffff) i++;
      const g = this.glyphs.get(cp);
      if (g === undefined) continue;
      // [codepoint, x, y, w, h, left, top, advance]: the cell's place in the atlas, and its corner from the pen on the baseline
      if (g[3] > 0) drawImageRect(this.atlas, g[1], g[2], g[3], g[4], pen + g[5] * k, base - g[6] * k, g[3] * k, g[4] * k, alpha, ImageFlag.Msdf, 0, color);
      pen += g[7] * k;
    }
  }
}
