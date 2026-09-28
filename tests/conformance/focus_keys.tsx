// Focus scopes and keymaps through the test hooks (docs/ui.md, Focus scopes and keymaps): tabIndex order, disabled
// nodes, a dialog with a focus trap that focuses its first control when it shows and gives the focus back when it
// hides, Escape through the dismiss stack, focus-within, onFocusChange, and key bindings where the deepest
// keyContext on the focus path wins over outer ones and global bindings.
import { createSignal, createNodeRef, render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { quit } from 'zinc:gfx';

const [open, setOpen] = createSignal<boolean>(false);
const [dimmed, setDimmed] = createSignal<boolean>(true);
const names = new Map<i32, string>();
const toolbar = createNodeRef(), a = createNodeRef(), b = createNodeRef(), c = createNodeRef(), off = createNodeRef(), field = createNodeRef();
const editor = createNodeRef(), pane = createNodeRef(), inPane = createNodeRef(), inEditor = createNodeRef();
const dialog = createNodeRef(), ok = createNodeRef(), cancel = createNodeRef(), note = createNodeRef();
const nameOf = (h: i32): string => h < 0 ? 'none' : names.get(h) ?? `#${h}`;
const log = (s: string): void => { console.log(s); };

function App(): i32 {
  return <view class="flex-col gap-1 p-1 h-full">
  <view ref={toolbar} class="flex-row gap-1 focus-within:bg-sky-900">
    <button ref={a} class="w-10 h-5" onClick={() => log('A')}><text>A</text></button>
    <button ref={b} class="w-10 h-5" onClick={() => setOpen(true)}><text>Open</text></button>
    <button ref={c} class="w-10 h-5" tabIndex={1} onClick={() => log('C')}><text>C</text></button>
    <button ref={off} class="w-10 h-5" disabled={dimmed()} onClick={() => log('disabled clicked')}><text>Off</text></button>
  </view>
  <input ref={field} class="w-24" value="" />
  <view ref={editor} class="flex-col gap-1" keyContext="Editor">
    <button ref={inEditor} class="w-10 h-5"><text>E</text></button>
    <view ref={pane} keyContext="Pane"><button ref={inPane} class="w-10 h-5"><text>P</text></button></view>
  </view>
  <view ref={dialog} class="flex-col gap-1 p-1 bg-slate-700" hidden={open() ? 0 : 1}>
    <input ref={note} class="w-24" value="" />
    <button ref={ok} class="w-10 h-5" onClick={() => { log('ok'); setOpen(false); }}><text>OK</text></button>
    <button ref={cancel} class="w-10 h-5" onClick={() => setOpen(false)}><text>Cancel</text></button>
  </view>
  </view>;
}

let frame = 0, changes = 0;
render(App, 0x0f172a, (dt: number) => {
  frame++;
  if (frame === 1) {
  names.set(a.node, 'A'); names.set(b.node, 'Open'); names.set(c.node, 'C'); names.set(off.node, 'Off'); names.set(field.node, 'field');
  names.set(inEditor.node, 'E'); names.set(inPane.node, 'P'); names.set(ok.node, 'OK'); names.set(cancel.node, 'Cancel'); names.set(note.node, 'note');
  ui.focusScope(dialog.node, { trap: true, restore: true, autoFocus: true });
  ui.onDismiss(dialog.node, () => { log('dismiss dialog'); setOpen(false); });
  ui.onFocusChange((h: i32) => { changes++; });
  ui.bindKeys('mod-k', 'global.k');
  ui.bindKeys('mod-k', 'editor.k', 'Editor');
  ui.bindKeys('mod-k', 'pane.k', 'Pane');
  ui.bindKeys('j', 'pane.j', 'Pane');
  ui.bindKeys('cmd-shift-s', 'save.all');
  ui.bindKeys('ctrl-s', 'save');
  ui.bindKeys('mod-s', 'save');
  for (const act of ['global.k', 'editor.k', 'pane.k', 'save', 'save.all']) ui.onAction(-1, act, () => log(`action ${act} (global handler)`));
  ui.onAction(pane.node, 'pane.k', () => log('action pane.k (pane handler)'));
  ui.onAction(pane.node, 'pane.j', () => log('action pane.j'));
  return;
  }
  // one step per frame: unhandled Tab / Enter / arrows drive the focus navigation at the next frame, like the keyboard
  if (frame - 2 < steps.length) steps[frame - 2](); else quit();
});

const order: string[] = [];
const steps: (() => void)[] = [];
function tabStep(record: boolean, back: boolean): () => void {
  return () => { if (record) order.push(nameOf(ui.focused())); ui.keyDown(-1, 'Tab', back ? ui.SHIFT : 0); };
}
/** n Tab presses, one per frame, recording where the focus lands; then `then`. */
function tabs(n: i32, back: boolean, then: () => void): void {
  for (let i = 0; i < n; i++) steps.push(tabStep(i > 0, back));
  steps.push(() => { order.push(nameOf(ui.focused())); then(); });
}
steps.push(() => { ui.pointerAt(0, 0, false); console.log('-- Tab order: tabIndex 1 first, then the tree; the disabled button is skipped'); });
tabs(8, false, () => { console.log(order.join(' ')); order.length = 0; });
steps.push(() => {
  console.log('within toolbar', ui.hasFocusWithin(toolbar.node), 'focused', nameOf(ui.focused()));
  ui.focusNode(a.node);
  console.log('within toolbar', ui.hasFocusWithin(toolbar.node));
  console.log('-- disabled: a press does nothing; enabled again, it clicks');
  const ob = ui.screenBox(off.node);
  ui.pointerAt(ob[0] + 5, ob[1] + 5, true); ui.pointerAt(ob[0] + 5, ob[1] + 5, false);
  console.log('focused', nameOf(ui.focused()), 'disabled', ui.isDisabled(off.node));
  setDimmed(false);
  ui.pointerAt(ob[0] + 5, ob[1] + 5, true); ui.pointerAt(ob[0] + 5, ob[1] + 5, false);
  console.log('focused', nameOf(ui.focused()));
  console.log('-- keymap: the deepest context wins');
  ui.keyDown(inPane.node, 'k', ui.META);
  ui.keyDown(inEditor.node, 'k', ui.CTRL);
  ui.keyDown(a.node, 'k', ui.META);
  ui.keyDown(inPane.node, 'j');
  console.log('plain j outside the pane handled:', ui.keyDown(a.node, 'j'));
  ui.keyDown(a.node, 's', ui.CTRL);
  ui.keyDown(a.node, 's', ui.META | ui.SHIFT);
  console.log('typing j in a field:', ui.keyDown(field.node, 'j'), 'cmd-s in a field:', ui.keyDown(-1, 's', ui.META));
  console.log('keysFor save:', ui.keysFor('save').join(' | '), 'keysFor nothing:', ui.keysFor('nothing').length);
  console.log('dispatchAction pane.j from A:', ui.dispatchAction('pane.j'));
  console.log('-- dialog: autoFocus, trap, Escape, restore');
  ui.focusNode(b.node);
  ui.keyDown(-1, 'Enter');   // activates the Open button at the next frame
});
steps.push(() => { console.log('open', open(), 'focused', nameOf(ui.focused())); });
tabs(4, false, () => {});
tabs(1, true, () => { console.log('Tab in the dialog:', order.join(' ')); });
steps.push(() => {
  ui.keyDown(note.node, 'Escape');   // in a field of the dialog: Escape closes the dialog
  console.log('open', open(), 'focused', nameOf(ui.focused()));
  ui.keyDown(-1, 'Enter');
});
steps.push(() => { console.log('reopened', open(), 'focused', nameOf(ui.focused())); ui.keyDown(-1, 'Tab'); });
steps.push(() => { ui.keyDown(-1, 'Enter'); });   // OK
steps.push(() => {
  console.log('open', open(), 'focused', nameOf(ui.focused()));
  ui.keyDown(-1, 'Escape');  // nothing to dismiss: the focused button blurs
  console.log('focused', nameOf(ui.focused()), 'focus changes', changes);
});
