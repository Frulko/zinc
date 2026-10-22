// Text input on phones (docs/ui.md, "Text input on phones"): IME composition from compose.input (the composing run underlined, then committed),
// then a finger's long press selects a word with handles and the edit menu, a handle dragged under the magnifier extends the selection, and
// the menu's Copy copies it; the keyboard traits the field asks the OS for go to ZINC_DEVICE_LOG.
import { render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { clipboardText } from 'zinc:gfx';

function App(): i32 {
  return <View className="flex-1 bg-white p-4 pt-24">
    <Input className="bg-slate-800 border border-slate-600 rounded-md text-[14px] px-2 py-1.5 text-slate-100 w-full" value="hello wide world" />
  </View>;
}

let frame = 0, field = -1;
const touch = (x: number, y: number, phase: i32): void => ui.touchAt(1, x, y, phase);
ui.addWatcher((): void => {
  frame++;
  if (field < 0) for (let i = 0; i < 20; i++) { const n = ui.inspectNode(i); if (n !== null && n.ed !== null) { field = i; break; } }
  if (field < 0) return;
  const n = ui.inspectNode(field);
  if (n === null || n.ed === null) return;
  const e = n.ed as ui.Edit;
  if (frame === 2) { ui.focusNode(field); ui.select(field, 16, 16); }
  if (frame === 6 || frame === 9 || frame === 14) console.log(`f${frame} value "${e.value}" composing ${ui.composingRange().join(',')}`);
  // a long press on "wide" (about x 74)
  if (frame === 20) touch(74, 112, 0);
  if (frame === 56) console.log(`f56 selected "${e.value.slice(Math.min(e.caret, e.anchor), Math.max(e.caret, e.anchor))}" ${ui.touchSelection()}`);
  if (frame === 57) touch(74, 112, 2);
  // the end handle dragged to the end of the text
  const hs = ui.selectionHandles();
  if (frame === 60 && hs.length === 4) touch(hs[2], hs[3] + 10, 0);
  if (frame > 60 && frame <= 66 && hs.length === 4) touch(hs[2] + 12, hs[3] + 10, 1);
  if (frame === 68) touch(300, 200, 2);
  if (frame === 70) console.log(`f70 selected "${e.value.slice(Math.min(e.caret, e.anchor), Math.max(e.caret, e.anchor))}" ${ui.touchSelection()}`);
  // Copy from the edit menu
  if (frame === 72) {
    const r = ui.editMenuRects(), items = ui.touchSelection().split(' ')[1].split(',');
    const k = items.indexOf('Copy');
    if (k >= 0) { touch(r[4 * k] + r[4 * k + 2] / 2, r[4 * k + 1] + r[4 * k + 3] / 2, 0); touch(r[4 * k] + r[4 * k + 2] / 2, r[4 * k + 1] + r[4 * k + 3] / 2, 2); }
  }
  if (frame === 75) console.log(`f75 clipboard "${clipboardText()}" ${ui.touchSelection()}`);
});
render(App, 0xffffff, (dt: number) => {});
