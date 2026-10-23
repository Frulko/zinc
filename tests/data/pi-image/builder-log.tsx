import * as ui from 'zinc:ui';
import { render, createSignal } from 'zinc:ui/solid';
import { LogView } from '../../../image/builder/src/components/log-view';

const [lines, setLines] = createSignal<string[]>([]);
function expect(value: boolean, message: string): void { if (!value) throw new Error(message); }
function area(): i32 {
  for (let h = 0; h < 5000; h++) {
    const n = ui.inspectNode(h);
    if (n !== null && n.label === 'Build output') return h;
  }
  throw new Error('missing build output scroll area');
}
function bottom(): void {
  const h = area();
  ui.screenBox(h);
  const n = ui.inspectNode(h) as ui.UiNode;
  expect(n.endY > 0 && Math.abs(ui.scrollTop(h) - n.endY) < 1, 'new output was not followed');
}
function add(count: i32): void {
  const next = lines().slice();
  for (let i: i32 = 0; i < count; i++) next.push('Package ' + next.length + ' installed');
  setLines(next);
}
function App(): i32 { return <View className="w-full h-full p-4 bg-[#20362b]"><LogView lines={lines} /></View>; }
let f = 0;
render(App, 0x20362b, (dt: number) => {
  f++;
  if (f === 2) expect(ui.find('Waiting for the first line…') >= 0, 'empty state missing');
  if (f === 3) add(60);
  if (f === 5) { bottom(); ui.scrollTo(area(), 0, 20); }
  if (f === 6) add(5);
  if (f === 8) expect(Math.abs(ui.scrollTop(area()) - 20) < 1, 'reading old output was interrupted');
  if (f === 9) {
    const box = ui.screenBox(ui.find('Latest output'));
    ui.pointerAt(box[0] + box[2] / 2, box[1] + box[3] / 2, true);
    ui.pointerAt(box[0] + box[2] / 2, box[1] + box[3] / 2, false);
  }
  if (f === 11) bottom();
  if (f === 12) add(5);
  if (f === 14) { bottom(); setLines(['::step 4/4 Compressing', ...lines()]); }
  if (f === 16) { bottom(); console.log('builder log: follow, pause on scroll and pointer resume OK'); }
});
