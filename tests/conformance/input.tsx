// Text fields, keyboard and pointer events driven headlessly (ui.typeText / keyDown / pointerAt / wheelAt test hooks):
// editing, selection, clipboard, undo, code editor keys, caret placement with the mouse, drag with pointer capture,
// double / right click, hover, wheel zoom and hit testing through a scaled view. Same output on sim and native.
import { createSignal, createNodeRef } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { quit } from 'zinc:gfx';

const [name, setName] = createSignal<string>('');
const [code, setCode] = createSignal<string>('let a = 1;');
const [x, setX] = createSignal<number>(10);
const [zoom, setZoom] = createSignal<number>(1);
const nameRef = createNodeRef(), codeRef = createNodeRef(), cardRef = createNodeRef(), worldRef = createNodeRef();
let changes = 0, saved = 0, dbl = 0, menus = 0, enters = 0, leaves = 0, grab = 0;
const r = (v: number): number => Math.round(v);
ui.onKey((e: ui.KeyEvent) => { if (e.primary && e.key === 's') { saved++; e.preventDefault(); } });

const root = ui.createNode(ui.VIEW);
ui.insert(root, <view class="flex-col p-2 gap-2 h-full">
  <input ref={nameRef} class="w-full focus:border-amber-400" placeholder="Name" value={name()}
    onInput={(v: string) => setName(v)} onChange={(v: string) => { changes++; console.log('change', v); }} />
  <textarea ref={codeRef} class="font-mono text-sm" lineNumbers rows={3} value={code()} onInput={(v: string) => setCode(v)} highlight={(l: string) => ui.tsHighlight(l)} />
  <view class="grow bg-slate-800 overflow-hidden" onWheel={(e: ui.PointerEvent) => { setZoom(zoom() * (e.wheel > 0 ? 2 : 0.5)); }}>
    <view ref={worldRef} class="absolute left-0 top-0 w-[400] h-[400]" style={{ scale: zoom() }}>
      <view ref={cardRef} class="absolute top-[10] w-[40] h-[20] bg-sky-500 cursor-grab hover:bg-sky-400" style={{ left: x() }}
        onPointerDown={(e: ui.PointerEvent) => { grab = ui.toLocal(worldRef.node, e.gx, e.gy)[0] - x(); console.log('down', r(e.x), r(e.y), e.button); }}
        onPointerMove={(e: ui.PointerEvent) => { if (grab > -1000) setX(r(ui.toLocal(worldRef.node, e.gx, e.gy)[0] - grab)); }}
        onPointerUp={(e: ui.PointerEvent) => { grab = -1000; console.log('up', r(e.x), r(e.y)); }}
        onDoubleClick={(e: ui.PointerEvent) => { dbl++; }}
        onContextMenu={(e: ui.PointerEvent) => { menus++; console.log('menu at', r(e.x), r(e.y)); }}
        onPointerEnter={(e: ui.PointerEvent) => { enters++; }} onPointerLeave={(e: ui.PointerEvent) => { leaves++; }} />
    </view>
  </view>
</view>, -1);
grab = -1000;
ui.pointerAt(0, 0, false);  // test hooks drive the input from now on

const box = (h: i32): string => ui.screenBox(h).map((v: number) => `${r(v)}`).join(',');
let f = 0;
ui.mount(root, 0x0f172a, (dt: number) => {
  f++;
  const inp = nameRef.node, ta = codeRef.node, card = cardRef.node;
  if (f === 2) {
    console.log(ui.dump());
    ui.typeText(inp, 'Hello world');
    ui.keyDown(-1, 'Backspace'); ui.keyDown(-1, 'Backspace');
    console.log('typed', name(), ui.caretOf(inp));
    ui.keyDown(-1, 'ArrowLeft', ui.ALT);
    ui.typeText(-1, 'big ');
    ui.keyDown(-1, 'Home');
    for (let i = 0; i < 5; i++) ui.keyDown(-1, 'ArrowRight', ui.SHIFT);
    console.log('selected', ui.selectedText(inp));
    ui.keyDown(-1, 'x', ui.META);
    ui.keyDown(-1, 'End');
    ui.keyDown(-1, 'v', ui.META);
    console.log('cut/paste', name());
    ui.keyDown(-1, 'z', ui.META);
    console.log('undo', name());
    ui.keyDown(-1, 'z', ui.META | ui.SHIFT);
    console.log('redo', name());
    ui.keyDown(-1, 'a', ui.CTRL);
    ui.typeText(-1, 'Zinc');
    ui.keyDown(-1, 'Enter');
    console.log('value', name(), 'changes', changes);
    console.log('letter handled by the field', ui.keyDown(-1, 'q'), 'save', ui.keyDown(-1, 's', ui.META), saved);
    ui.keyDown(-1, 'Tab');
    console.log('tab to textarea', ui.focused() === ta);
  }
  if (f === 3) {
    ui.select(ta, 10, 10);
    ui.keyDown(-1, 'Enter'); ui.typeText(-1, 'if (a) {');
    ui.keyDown(-1, 'Enter'); ui.keyDown(-1, 'Tab'); ui.typeText(-1, 'a++;');
    ui.keyDown(-1, 'Enter'); ui.typeText(-1, '}');
    console.log('code', code().replaceAll('\n', '|'));
    ui.keyDown(-1, 'ArrowUp');
    console.log('caret after up', ui.caretOf(ta));
    ui.keyDown(-1, 'Backspace', ui.ALT);
    console.log('word delete', code().replaceAll('\n', '|'));
    console.log('highlight', ui.tsHighlight('const s = "hi"; // Note').join(','));
    // mouse: caret placement, double click word, drag selection in the single-line field
    const b = ui.screenBox(inp);
    ui.pointerAt(b[0] + 30, b[1] + 10, true); ui.pointerAt(b[0] + 30, b[1] + 10, false);
    console.log('clicked caret', ui.caretOf(inp), 'focus back', ui.focused() === inp);
    ui.setValue(inp, 'one two three');
    ui.pointerAt(b[0] + 40, b[1] + 10, true); ui.pointerAt(b[0] + 40, b[1] + 10, false);
    ui.pointerAt(b[0] + 40, b[1] + 10, true); ui.pointerAt(b[0] + 40, b[1] + 10, false);
    console.log('double click', ui.selectedText(inp));
    ui.pointerAt(b[0] + 9, b[1] + 10, true); ui.pointerAt(b[0] + 60, b[1] + 10, true); ui.pointerAt(b[0] + 60, b[1] + 10, false);
    console.log('drag select', ui.selectedText(inp));
  }
  if (f === 4) {
    console.log('card', box(card));
    const b = ui.screenBox(card), cx = b[0] + 5, cy = b[1] + 5;
    ui.pointerAt(cx, cy, false);
    ui.pointerAt(cx, cy, true);
    ui.pointerAt(cx + 30, cy, true);
    ui.pointerAt(cx + 30, cy, false);
    console.log('dragged x', x(), 'enters', enters);
  }
  if (f === 5) {
    console.log('card', box(card));
    const b = ui.screenBox(card);
    ui.wheelAt(b[0] + 5, b[1] + 5, 1);
  }
  if (f === 6) {
    console.log('zoom', zoom(), 'card', box(card));
    const b = ui.screenBox(card), cx = b[0] + 20, cy = b[1] + 10;
    ui.pointerAt(cx, cy, true, 2); ui.pointerAt(cx, cy, false, 2);
    ui.pointerAt(cx, cy, true); ui.pointerAt(cx, cy, false);
    ui.pointerAt(cx, cy, true); ui.pointerAt(cx, cy, false);
    console.log('menus', menus, 'double clicks', dbl);
    ui.pointerAt(1, 1, false);
    console.log('enters', enters, 'leaves', leaves, 'hit through scale', ui.hitAt(cx, cy) === -1);
  }
  if (f === 7) quit();
});
