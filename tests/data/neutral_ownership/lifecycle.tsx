import * as react from 'zinc:ui/react';
import * as ui from 'zinc:ui';
import { equal } from 'zinc:assert';
import { Branch, changes, values } from './library';
import { toast, clearToasts } from 'zinc:ui/kit';
const list = new react.MutableRef<i32>(-1);
let show: (value: boolean) => void = (value: boolean) => {};
let refresh: (value: i32) => void = (value: i32) => {};
let stale: (value: i32) => void = (value: i32) => {};
let live: i32 = 0, cleanups: i32 = 0, rowRenders: i32 = 0, caught: i32 = 0;
let fail = false;
let retained: i32 = 0;
let oldSetter: (value: i32) => void = (value: i32) => {};
function Row(p: { n: i32 }): i32 {
  const [value, change] = react.useState<i32>(0);
  if (p.n === 0) stale = change;
  rowRenders++;
  react.useEffect(() => { live++; return () => { live--; cleanups++; }; }, []);
  return <Text>{p.n + ':' + value}</Text>;
}
function Fallible(): i32 {
  react.useState<i32>(123);
  const node = react._el(ui.TEXT);
  if (fail) throw new Error('component render failed');
  ui.setText(node, 'healthy');
  return node;
}
function App(): i32 {
  const [shown, change] = react.useState(true), [revision, revise] = react.useState<i32>(0);
  show = change; refresh = revise;
  const result = react._el(ui.VIEW), branch = react._el(ui.FRAGMENT);
  ui.insert(result, branch, -1); react._rc(branch, () => Branch({ when: () => revision === 0 }), 'Branch');
  const child = react._el(ui.FRAGMENT);
  ui.insert(result, child, -1);
  try { react._rc(child, () => Fallible(), 'Fallible'); }
  catch (e) { equal(e.message, 'component render failed'); caught++; }
  const [after, setAfter] = react.useState<i32>(17);
  retained = after; if (revision === 1) setAfter(18);
  if (shown) {
    const scroller = react._el(ui.SCROLL); list.current = scroller;
    ui.setClass(scroller, 'h-[120]'); ui.insert(result, scroller, -1);
    react._virtual(scroller, 20, 40, (n: i32) => <Row n={n} />);
  }
  return result;
}
function nodeReentry(): void {
  const parent = ui.createNode(ui.VIEW), child = ui.createNode(ui.VIEW);
  ui.insert(parent, child, -1);
  let calls: i32 = 0, replacement: i32 = -1;
  ui.onDestroy(child, () => { calls++; ui.destroy(parent); replacement = ui.createNode(ui.TEXT); ui.setText(replacement, 'survived'); });
  ui.destroy(parent);
  equal(calls, 1); equal(ui.nodeSerial(replacement) > 0, true, 'reentrant parent release keeps replacement'); equal(ui.inspectNode(replacement)!.text, 'survived');
  ui.destroy(replacement);
  const throws = ui.createNode(ui.VIEW);
  ui.onDestroy(throws, () => { throw new Error('dispose failure'); });
  let caught = false;
  try { ui.destroy(throws); } catch (e) { equal(e.message, 'dispose failure'); caught = true; }
  equal(caught, true);
  const reused = ui.createNode(ui.VIEW), other = ui.createNode(ui.VIEW);
  equal(reused, throws, 'failed cleanup returns free slot once'); equal(other !== reused, true); ui.destroy(reused); ui.destroy(other);
}
let ownerHost: i32 = -1, survivor: i32 = -1, ownerCleanups: i32 = 0;
let removeOwnerChild: (value: boolean) => void = (value: boolean) => {};
function ReentrantChild(): i32 {
  react.useEffect(() => () => { ownerCleanups++; ui.destroy(ownerHost); survivor = ui.createNode(ui.TEXT); ui.setText(survivor, 'logical survivor'); }, []);
  return <Text>child</Text>;
}
function ReentrantOwner(): i32 {
  const [shown, change] = react.useState(true); removeOwnerChild = change;
  return shown ? <ReentrantChild /> : <Text>gone</Text>;
}
let frame: i32 = 0, replacement: i32 = -1, serial: i32 = 0, priorRenders: i32 = 0;
react.render(App, 0xffffff, (dt: number) => {
  frame++;
  if (frame === 2) {
    const node = ui.inspectNode(list.current); if (node === null || node.virt === null) throw new Error('missing virtual list');
    const row = node.virt.rows.get(0); if (row === undefined) throw new Error('missing row');
    oldSetter = stale; ui.detachChildren(list.current); ui.destroy(row);
    replacement = ui.createNode(ui.TEXT); equal(replacement, row, 'reused row slot');
    serial = ui.nodeSerial(replacement); ui.setText(replacement, 'new occupant'); ui.insert(ui.rootNode(), replacement, -1);
    const change = changes.get('then'); if (change === undefined) throw new Error('missing branch'); change(9);
    refresh(1);
  }
  if (frame === 3) {
    equal(cleanups, 1, 'retained list releases stale row subscription once');
    equal(ui.nodeSerial(replacement), serial, 'retained list cannot destroy replacement');
    equal(ui.inspectNode(replacement)!.parent, ui.rootNode(), 'retained list cannot steal replacement');
    const node = ui.inspectNode(list.current)!;
    equal(node.children.indexOf(replacement), -1, 'replacement stays out of list');
    show(false); fail = true; refresh(2);
  }
  if (frame === 4) {
    equal(live, 0, 'parent close releases all row subscriptions');
    equal(ui.nodeSerial(replacement), serial, 'stale owner cannot destroy new node');
    equal(ui.inspectNode(replacement)!.text, 'new occupant'); priorRenders = rowRenders; oldSetter(91);
    equal(caught > 0, true); equal(retained, 18, 'throw restores parent hook owner');
    const branch = values.get('else'); if (branch === undefined) throw new Error('missing alternate branch'); equal(branch(), 9, 'same type at same branch position preserves state');
    fail = false; refresh(3);
  }
  if (frame === 5) { equal(rowRenders, priorRenders, 'stale setter cannot render old instance'); equal(retained, 18, 'restart preserves parent state'); equal(ui.nodeSerial(replacement), serial); equal(live, 0); for (let i: i32 = 0; i < 3; i++) { toast('Saved', '', -1, { action: 'Undo' }); clearToasts(); } ui.destroy(ui.rootNode()); equal(react._active(), false, 'imperative toast and app owners are released'); nodeReentry(); ownerHost = ui.createNode(ui.FRAGMENT); react._rc(ownerHost, () => ReentrantOwner(), 'ReentrantOwner'); removeOwnerChild(false); }
  if (frame === 6) { equal(ownerCleanups, 1, 'logical reentrant cleanup runs once'); equal(ui.find('gone'), -1, 'interrupted render releases new orphan nodes'); equal(ui.nodeSerial(survivor) > 0, true); equal(ui.inspectNode(survivor)!.text, 'logical survivor'); equal(react._active(), false, 'reentrant logical owner is released'); ui.destroy(survivor); console.log('neutral lifecycle: pass'); }
});
