// tests/t1/ink_tools.sh: one stroke of each zinc:ink writing tool, the JSON round trip (and a file of before the tools), the SVG's
// styles, undo/redo, the area eraser; then the strokes under zinc:remarkable's InkPalette for the pixel golden.
import { render } from 'zinc:ui/solid';
import { PenFlag } from 'zinc:gfx';
import { Ink, InkCanvas, TOOLS, parseStrokes } from 'zinc:ink';
import { InkPalette } from 'zinc:remarkable';

const ink = new Ink();
ink.w = 1000; ink.h = 560;
const colors: i32[] = [0x000000, 0x4e69c9, 0xb33e39, 0x000000, 0x000000, 0xfbf719];
function line(x0: number, y0: number, x1: number, y1: number, wave: number): void {
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    ink.feed(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + Math.sin(t * 12) * wave, 0.2 + 0.8 * t, PenFlag.Down);
  }
  ink.feed(x1, y1, 0, 0);
}
for (let k = 0; k < 5; k++) {
  ink.tool = TOOLS[k]; ink.color = colors[k]; ink.width = 6;
  line(60, 60 + k * 90, 900, 60 + k * 90, k === 4 ? 60 : 25);   // calligraphy: steeper, to show the nib
}
ink.tool = 'highlighter'; ink.color = colors[5]; ink.width = 6;
line(300, 30, 360, 480, 0);
console.log('tools ' + ink.strokes.map((s) => s.tool).join(','));
console.log('calligraphy widths ' + ink.strokes[4].segWidth(3).toFixed(1) + ' ' + ink.strokes[4].segWidth(9).toFixed(1));

const json = ink.toJSON();
const copy = new Ink();
copy.w = ink.w; copy.h = ink.h;
copy.setStrokes(parseStrokes(json));
console.log('round trip ' + (copy.toJSON() === json ? 'same' : 'differs') + ' ' + copy.strokes.map((s) => s.tool).join(','));
const old = '{"version":1,"width":100,"height":80,"strokes":[{"color":"#e11d48","width":8,"points":[70.0,60.0,0.500,75.0,61.0,0.700]}]}';
const o = new Ink();
o.w = 100; o.h = 80;
o.setStrokes(parseStrokes(old));
console.log('old file ' + o.strokes[0].tool + ' ' + (o.toJSON() === old ? 'same' : 'differs'));

const svg = ink.toSVG();
for (const t of ['fineliner', 'marker', 'pencil', 'calligraphy', 'highlighter'])
  console.log('svg ' + t + ' ' + (svg.indexOf(`data-tool="${t}"`) >= 0 ? 'yes' : 'no'));
console.log('svg highlighter first ' + (svg.indexOf('data-tool="highlighter"') < svg.indexOf('<g ') ? 'yes' : 'no')
  + ', translucent ' + (svg.indexOf('stroke-opacity="0.35"') >= 0 ? 'yes' : 'no'));
console.log('svg pencil lighter ' + (svg.indexOf('<polyline points=', svg.indexOf('data-tool="pencil"')) < svg.indexOf('</g>', svg.indexOf('data-tool="pencil"'))
  && svg.slice(svg.indexOf('data-tool="pencil"'), svg.indexOf('</g>', svg.indexOf('data-tool="pencil"'))).indexOf('stroke="#') > 0 ? 'yes' : 'no'));

ink.undo(); ink.undo();
console.log('undo ' + ink.strokes.length.toString() + ' redo? ' + (ink.canRedo() ? 'yes' : 'no'));
ink.redo(); ink.redo();
console.log('redo ' + ink.strokes.length.toString() + ' same ' + (ink.toJSON() === json ? 'yes' : 'no'));
ink.tool = 'area';
ink.feed(20, 120, 0.5, PenFlag.Down); ink.feed(980, 200, 0.5, PenFlag.Down); ink.feed(980, 200, 0, 0);   // around the fineliner's row
console.log('area ' + ink.strokes.length.toString() + ' ' + ink.strokes.map((s) => s.tool).join(','));
ink.undo();
console.log('area undo ' + ink.strokes.length.toString());
ink.tool = 'ballpoint'; ink.color = 0x000000; ink.width = 6;

function App(): i32 {
  return <View className="flex-col h-full bg-white">
    <InkPalette ink={ink} />
    <InkCanvas ink={ink} className="grow" />
  </View>;
}
render(App, 0xffffff, null);
