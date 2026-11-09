// The font importer (ZN-442, tests/t0/font_assets.sh): the MSDF atlas of assets/fonts/Inter.ttf holds ASCII and the characters of
// assets/i18n/text.json, and a 12 px label drawn 8 times larger, directly or through a matrix, against the font rasterized at 96 px.
import { onFrame, clear, drawText, loadFont, fontAscent, setTransform, resetTransform } from 'zinc:gfx';
import { env } from 'zinc:sys';
import { MsdfFont } from 'zinc:gfx/msdf';

const f = MsdfFont.load('fonts/Inter.ttf');
if (f === null) throw new Error('no MSDF atlas for fonts/Inter.ttf');
console.log(`Ł ${f.width('Ł', 32) > 0} П ${f.width('П', 32) > 0} ж ${f.width('ж', 32) > 0}`);   // from the i18n file, from it, in no charset
const mode = env('FONT_MODE'), px = 12 * 8, base = 120, text = 'Ag';
onFrame(() => {
  clear(0xffffff);
  if (mode === 'msdf') f.draw(text, 10, base - f.ascent * px / f.size, px, 0x000000);
  else if (mode === 'turned') { setTransform(8, 0, 0, 8, 10, 0); f.draw(text, 0, base / 8 - f.ascent * 12 / f.size, 12, 0x000000); resetTransform(); }
  else { const r = loadFont('fonts/Inter.ttf', px); drawText(r, 10, base - fontAscent(r), text, 0x000000, 255, 0); }   // the reference
});
