// The inspector's own layout check (ZINC_INSPECTOR_DUMP=layout, tests/t1/inspector_layout.sh): every node of its window must lie inside what
// shows it, the window cut by the scroll areas around it, except along an axis one of them scrolls (reachable by scrolling); and a text must
// not draw lines wider than its box (cut without a way to read them). Then the wide table's grid scrolled sideways (its header follows) and
// the program list's splitter dragged.
import { inspectRoot, inspectNode, screenBox, UiNode, TEXT, TAG_NAMES, find, scrollTo, scrollLeft, pointerAt, nodeAt } from 'zinc:ui';
import { width, height } from 'zinc:gfx';
import { setView, sleep, sideW } from './state';
import { openTable, tbl } from './storage';

const FAR = 1000000;
/** The nodes that leave what shows them, one line each: `<tag class> x,y wxh outside x0,y0-x1,y1`. */
export function outside(): string[] {
  const out: string[] = [];
  walk(inspectRoot(), [0, 0, width(), height()], out);
  return out;
}
function name(n: UiNode): string { return '<' + TAG_NAMES[n.tag] + (n.cls !== '\u0000' && n.cls.length > 0 ? ' ' + n.cls : '') + (n.tag === TEXT ? ' "' + n.text.slice(0, 30) + '"' : '') + '>'; }
function walk(h: i32, clip: number[], out: string[]): void {
  const n = inspectNode(h);
  if (n === null || n.hidden || n.layer) return;
  const b = screenBox(h);
  if (b[2] > 0 && b[3] > 0 && (b[0] < clip[0] - 1 || b[1] < clip[1] - 1 || b[0] + b[2] > clip[2] + 1 || b[1] + b[3] > clip[3] + 1))
    out.push(name(n) + ' ' + b.map((v: number) => Math.round(v)).join(',') + ' outside ' + clip.map((v: number) => v === FAR || v === -FAR ? '∞' : '' + Math.round(v)).join(','));
  if (n.tag === TEXT && !n.ellipsis) {
    let widest = 0;
    for (const w of n.lineW) if (w > widest) widest = w;
    if (widest + n.pl + n.pr > n.lw + 1) out.push(name(n) + ' lines ' + Math.round(widest) + ' px wide in ' + Math.round(n.lw));
    return;
  }
  let c = clip;
  if (n.scroll !== 0 || n.overflow) {   // what it shows: its own box, but along an axis it scrolls (whatever is there can be scrolled to)
    c = [Math.max(clip[0], b[0]), Math.max(clip[1], b[1]), Math.min(clip[2], b[0] + b[2]), Math.min(clip[3], b[1] + b[3])];
    if ((n.scroll & 2) !== 0) { c[0] = -FAR; c[2] = FAR; }
    if ((n.scroll & 1) !== 0) { c[1] = -FAR; c[3] = FAR; }
  }
  for (const k of n.children) walk(k, c, out);
}

/** ZINC_INSPECTOR_DUMP=layout: each view checked, the grid scrolled, a splitter dragged; it ends on the wide table. */
export async function dumpLayout(): Promise<void> {
  console.log('window: ' + width() + ' x ' + height());
  for (const v of ['info', 'elements', 'screen', 'network', 'storage', 'sources', 'performance', 'threads']) {
    setView(v);
    if (v === 'storage') await openTable('tracks', 0);
    await sleep(400);
    const o = outside();
    console.log('layout ' + v + ': ' + (o.length === 0 ? 'inside' : o.length + ' outside'));
    for (let i = 0; i < o.length && i < 8; i++) console.log('  ' + o[i]);
  }
  setView('storage');
  await sleep(300);
  const sc = tbl.scroller.node, n = inspectNode(sc) as UiNode;
  const head = find('comment'), cell = find('Track 1');   // the last column's header, a cell of the first row
  const h0 = screenBox(head)[0], c0 = screenBox(cell)[0];
  console.log('grid: ' + tbl.cols().length + ' columns, ' + (n.contentW > n.lw ? 'wider than its pane' : 'fits its pane'));
  scrollTo(sc, 300, 0);
  await sleep(200);
  const dh = h0 - screenBox(head)[0], dc = c0 - screenBox(cell)[0];
  console.log('grid scrolled ' + Math.round(scrollLeft(sc)) + ': header moved ' + Math.round(dh) + ', rows moved ' + Math.round(dc) + (Math.abs(dh - dc) < 0.5 ? ', in sync' : ', apart'));
  const o = outside();
  console.log('layout storage scrolled: ' + (o.length === 0 ? 'inside' : o.length + ' outside'));
  scrollTo(sc, 0, 0);
  const w0 = sideW(), x = screenBox(nodeAt(w0 + 2, 300))[0], y = 300;   // the splitter right of the program list
  pointerAt(x + 2, y, true);
  for (let k = 1; k <= 4; k++) { await sleep(40); pointerAt(x + 2 + k * 15, y, true); }
  await sleep(40);
  pointerAt(x + 62, y, false);
  await sleep(200);
  console.log('splitter dragged 60 px: the program list ' + w0 + ' -> ' + sideW());
  const o2 = outside();
  console.log('layout after the drag: ' + (o2.length === 0 ? 'inside' : o2.length + ' outside'));
  for (let i = 0; i < o2.length && i < 8; i++) console.log('  ' + o2[i]);
}
