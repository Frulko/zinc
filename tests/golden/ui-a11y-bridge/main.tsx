// The screen reader bridge (ZN-630, tests/t0/ui_a11y_bridge.sh): what zinc:ui sends the host (zinc:sys device('a11y', ...), logged to stdout
// by ZINC_DEVICE_LOG) frame by frame. The script's `a11y 1` turns it on: the whole tree first, then only changes. A button pressed by the
// reader changes a label and a checkbox; the reader's cursor on the last row scrolls it into view (its box moves, the rows above go off screen),
// the reader scrolls the list back a page; a dialog hides the tree under it and gives it back; `a11y 0` stops it.
import { render, createSignal, createNodeRef } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { quit } from 'zinc:gfx';

const [count, setCount] = createSignal<i32>(0);
const scroller = createNodeRef();
const dialog = ui.createNode(ui.VIEW);
ui.setClass(dialog, 'absolute left-[20px] top-[20px] w-[160px] h-[60px] bg-white');
ui.setRole(dialog, 'dialog'); ui.setLabel(dialog, 'Saved');

function App(): i32 {
  return <View role="form" aria-label="Notes" className="flex-col gap-1 p-2 w-full h-full">
    <Text className="text-lg">Today</Text>
    <Input aria-label="Title" value="Groceries" className="bg-slate-800 border-slate-600 rounded-md text-[14px] px-2 py-1.5 text-slate-100 h-6 border" />
    <Input placeholder="Search" className="bg-slate-800 border-slate-600 rounded-md text-[14px] px-2 py-1.5 text-slate-100 h-6 border" />
    <Button aria-label={`Add (${count()})`} className="bg-slate-700 px-2 py-1 h-6" onClick={() => setCount(count() + 1)}><Text>Add</Text></Button>
    <View role="checkbox" aria-label="Done" aria-checked={count() > 0} className="h-4" />
    <View aria-hidden className="h-4"><Text>decor</Text></View>
    <Button disabled className="bg-slate-700 px-2 py-1 h-6"><Text>Delete</Text></Button>
    <ScrollView ref={scroller} className="h-[60px]">
      <Text className="h-[30px]">Milk</Text>
      <Text className="h-[30px]">Bread</Text>
      <Text className="h-[30px]">Eggs</Text>
      <Text className="h-[30px]">Tea</Text>
    </ScrollView>
  </View>;
}
function nodeLabelled(label: string): i32 {
  for (let h = 0; h < 400; h++) { const n = ui.inspectNode(h); if (n !== null && (n.label === label || n.text === label)) return h; }
  return -1;
}
let frame = 0;
function step(name: string, f: () => void): void { console.log(`frame ${frame}: ${name}`); f(); }
render(App, 0xffffff, (_dt: number) => {
  frame++;
  if (frame === 2) { console.log('inspect:'); console.log(ui.inspect()); }
  if (frame === 3) step('the reader presses Add', () => { ui.systemSignal(`a11yactivate ${nodeLabelled('Add (0)')}`); });
  if (frame === 5) step('the reader moves to Tea', () => { ui.systemSignal(`a11yfocus ${nodeLabelled('Tea')}`); });
  if (frame === 6) step('the reader scrolls the list back a page', () => { ui.systemSignal(`a11yscroll ${scroller.node} -1`); });
  if (frame === 7) step('a dialog opens', () => { ui.openLayer(dialog, { priority: 200, modal: true, backdrop: 0, motion: 'none' }); });
  if (frame === 9) { console.log('inspect:'); console.log(ui.inspect()); }
  if (frame === 9) step('the dialog closes', () => { ui.closeLayer(dialog); ui.setClass(dialog, 'hidden'); });
  if (frame === 11) step('the reader stops', () => { ui.systemSignal('a11y 0'); });
  if (frame === 12) step('a change nobody hears', () => { setCount(5); });
  if (frame === 14) { console.log(`done: ${ui.a11yUpdates()} updates, active ${ui.a11yActive()}`); quit(); }
});
