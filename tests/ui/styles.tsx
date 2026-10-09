import { StyleSheet } from 'zinc:ui';
import * as ui from 'zinc:ui';
import { createSignal, createNodeRef } from 'zinc:ui/solid';
const styles = StyleSheet.create({
  base: { width: '50%', padding: '8px 12px', backgroundColor: '#123456', flexDirection: 'row' },
  selected: { width: 100, paddingLeft: 3, backgroundColor: '#ffffff', opacity: 0.5, translateX: 20 },
});
const [selected, setSelected] = createSignal(true);
const ref = createNodeRef();
const root = <view ref={ref} class="w-[40] p-1 bg-red-500" style={[styles.base, selected() && styles.selected, { height: 32 }]} />;
function verify(on: boolean): void {
  const n = ui.inspectNode(ref.node);
  if (n === null) throw new Error('missing node');
  if (n.w !== (on ? 100 : -1) || n.wFrac !== (on ? 0 : 0.5)) throw new Error('dimension precedence');
  if (n.pl !== (on ? 3 : 12) || n.pt !== 8) throw new Error('padding precedence');
  const white: i32 = 0xffffff, blue: i32 = 0x123456;
  const expected: i32 = on ? white : blue;
  if (n.bg !== expected) throw new Error('color precedence');
  if (n.tx !== (on ? 20 : 0) || n.opacity !== (on ? 0.5 : 1)) throw new Error('removed property');
}
verify(true); setSelected(false); verify(false); setSelected(true); verify(true);
ui.setClass(ref.node, 'p-10 bg-blue-500'); verify(true);
ui.setStyles(ref.node, []);
const cleared = ui.inspectNode(ref.node);
if (cleared === null || cleared.pl !== 40 || cleared.tx !== 0 || cleared.opacity !== 1) throw new Error('clear style');
ui.setStyles(ref.node, [new ui.Style(['widthPercent', 'padding'], [0.5, 8])]);
ui.setNumber(ref.node, 'width', 77);
ui.setNumber(ref.node, 'paddingLeft', 9);
ui.setStyles(ref.node, [new ui.Style(['widthPercent', 'padding'], [0.4, 16])]);
const overridden = ui.inspectNode(ref.node);
if (overridden === null || overridden.w !== 77 || overridden.wFrac !== 0 || overridden.pl !== 9 || overridden.pt !== 16) throw new Error('imperative aliases');
console.log('styles OK');
