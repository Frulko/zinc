// Text layout (ZN-269): exact lines for line-clamp, nowrap, pre, break-words, break-all, truncate, balance; default wrapping unchanged.
import * as ui from 'zinc:ui';
import { quit } from 'zinc:gfx';
const long = 'The quick brown fox jumps over the lazy dog. '.repeat(14);   // 630 chars
function lines(cls: string, text: string, w: number): void {
  const h = ui.createNode(ui.TEXT);
  ui.setClass(h, cls);
  ui.setText(h, text);
  const root = ui.createNode(ui.VIEW), box = ui.createNode(ui.VIEW);
  ui.setClass(box, 'w-[' + w + 'px]');
  ui.insert(box, h, -1);
  ui.insert(root, box, -1);
  ui.setRoot(root);
  ui.layout();
  const n = ui.inspectNode(h);
  if (n === null) return;
  console.log(cls || '(default)', n.lines.length, JSON.stringify(n.lines));
}
lines('', long.slice(0, 120), 200);
lines('line-clamp-3', long, 200);
lines('line-clamp-1', long, 200);
lines('whitespace-nowrap', 'no wrap here at all in this line', 100);
lines('truncate', 'no wrap here at all in this line', 100);
lines('whitespace-pre', 'a  b\n  c', 200);
lines('whitespace-pre-wrap', 'one two three four five six\nseven', 90);
lines('', 'a\nb', 200);
lines('', 'Supercalifragilisticexpialidocious', 80);
lines('break-words', 'Supercalifragilisticexpialidocious', 80);
lines('break-all', 'abcdefghijklmnopqrstuvwxyz', 60);
lines('', 'aaa bbb ccc ddd eee fff ggg', 140);
lines('text-balance', 'aaa bbb ccc ddd eee fff ggg', 140);
quit();
