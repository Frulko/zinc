// zinc:gfx text under a matrix that scales (ZN-726): a line of a fixed-pitch font that begins and ends with a full block, and a line of
// sans between two H, at ten scales from 0.5 to 4, each over a ruler as wide as textWidth says. tests/t1/text_scaled.sh measures the ink of
// each line against its ruler: a line is as wide as without the matrix, times the scale. One line per row on stdout:
// name scale width, then the first and last rows of pixels of the text and of the ruler.
import { onFrame, clear, rect, drawText, textWidth, lineHeight, font, loadFont, setTransform, resetTransform } from 'zinc:gfx';

const SCALES: number[] = [0.5, 0.7, 1, 1.3, 1.7, 2, 2.5, 3, 3.5, 4];
const mono = loadFont('mono', 16), sans = font('sans', 16);   // mono: made at run time from its embedded file
let told = false;

function row(name: string, f: i32, text: string, s: number, y: number): number {
  const w = textWidth(f, text, 0), lh = lineHeight(f);
  setTransform(s, 0, 0, s, 10, y);
  drawText(f, 0, 0, text, 0x000000, 255, 0);
  rect(0, lh + 4, w, 4, 0x000000);
  if (!told) console.log(`${name} ${s} ${w} ${y} ${Math.ceil(y + (lh + 1) * s)} ${Math.floor(y + (lh + 4) * s)} ${Math.ceil(y + (lh + 8) * s)}`);
  return Math.ceil(y + (lh + 12) * s) + 2;
}

onFrame((dt: number) => {
  clear(0xffffff);
  let y = 8;
  for (const s of SCALES) {
    y = row('mono', mono, '█ The quick brown fox █', s, y);
    y = row('sans', sans, 'H the quick brown fox H', s, y);
  }
  resetTransform();
  told = true;
});
