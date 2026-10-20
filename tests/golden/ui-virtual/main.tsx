// Variable-height virtual list (ZN-193): 100k rows of 5 different heights; only the rows in view exist, the content height follows the measured rows, scrolling to an offset keeps what is shown.
import * as ui from 'zinc:ui';
import { quit } from 'zinc:gfx';
const N = 100000;
const root = ui.createNode(ui.VIEW);
ui.setClass(root, 'w-full h-full');
const list = ui.createNode(ui.SCROLL);
ui.setClass(list, 'w-full h-[200px]');
ui.insert(root, list, -1);
function heightOf(i: i32): i32 { return 20 + (i % 5) * 10; }
ui.virtualize(list, N, -30, (i: i32): i32 => {
  const row = ui.createNode(ui.VIEW);
  ui.setClass(row, 'h-[' + heightOf(i) + 'px] w-full');
  return row;
}, null);
function rows(): i32 { const n = ui.inspectNode(list); return n === null ? -1 : n.children.length; }
function show(tag: string): void {
  const n = ui.inspectNode(list);
  if (n === null) return;
  const first = n.children.length > 0 ? ui.inspectNode(n.children[0]) : null;
  console.log(tag, 'rows', rows(), 'contentH', Math.round(n.contentH), 'sy', Math.round(n.sy), 'firstTop', first === null ? -1 : Math.round(first.top));
}
let f = 0;
ui.mount(root, 0xffffff, (dt: number) => {
  f++;
  if (f === 3) { show('start'); ui.scrollTo(list, 0, 600000); }
  if (f === 6) { show('at 600000'); ui.scrollTo(list, 0, 0); }
  if (f === 9) { show('back at 0'); quit(); }
});
