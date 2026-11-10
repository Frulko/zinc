/** @jsxHelpers ./legacy */
import { render } from './legacy';
import * as ui from 'zinc:ui';
import { equal } from 'zinc:assert';
let calls: i32 = 0;
function Row(p: { n: i32 }): i32 { calls++; return <Button aria-label={'legacy' + p.n}><Text>{p.n}</Text></Button>; }
function wrap(make: () => i32): i32 { return make(); }
function App(): i32 { return <View>{[0, 1].map((n: i32) => <Row n={n} />,)}{wrap(() => <Text aria-label="wrapped">wrapped</Text>,)}</View>; }
function labels(h: i32): string {
  const n = ui.inspectNode(h); if (n === null) return '';
  let out = n.label === '' ? '' : n.label + ',';
  for (const child of n.children) out += labels(child);
  return out;
}
ui.setAfterPaint(() => { equal(labels(ui.rootNode()), 'legacy0,legacy1,wrapped,'); equal(calls, 2); console.log('jsx custom trailing: pass'); ui.setAfterPaint(null); });
render(App, 0xffffff, null);
