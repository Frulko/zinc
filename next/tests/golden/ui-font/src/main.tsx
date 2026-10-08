// Typography A (ZN-267): a family list falls through to the first face that exists, weights map to the nearest baked face, italic is a baked slant.
import * as ui from 'zinc:ui';
import { font, quit } from 'zinc:gfx';
const sans = font('sans', 16), sansBold = font('sans-bold', 16), inter = font('Inter-Regular', 16), interI = font('Inter-Regular~i', 16), sansI = font('sans~i', 16), boldI = font('sans-bold~i', 16), mono = font('mono', 16);
const cases = [
  'font-[Missing,Inter-Regular]', 'font-[Missing,Nothing]', 'font-[Inter-Regular,Missing]', 'font-[Inter-Regular] font-bold', 'font-[Inter-Regular] font-medium', 'font-[Inter-Regular] italic',
  'font-medium', 'font-light', 'font-thin', 'font-semibold', 'font-black', 'italic', 'font-bold italic', 'font-bold italic not-italic', 'font-mono',
];
const name = (f: i32): string => f < 0 ? 'none' : f === sans ? 'sans' : f === sansBold ? 'sans-bold' : f === inter ? 'inter' : f === interI ? 'inter~i' : f === sansI ? 'sans~i' : f === boldI ? 'sans-bold~i' : f === mono ? 'mono' : 'other';
for (const c of cases) {
  const h = ui.createNode(ui.TEXT);
  ui.setClass(h, c);
  ui.setText(h, 'x');
  ui.setRoot(h);
  ui.layout();
  const n = ui.inspectNode(h);
  console.log(c, n === null ? 'null' : name(n.fontId));
}
quit();
console.log('unnamed face baked:', font('Un' + 'used-Black', 16) >= 0);
