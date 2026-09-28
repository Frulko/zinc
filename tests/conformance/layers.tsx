// Layers, anchored positioning and dismissal through the test hooks (docs/ui.md, Layers): a menu declared inside a
// small clipping box opens as a layer anchored under its button, escapes the clip and is hit-tested first; presses
// outside it close it (not the button that toggles it); a popover under a button near the bottom flips above it; a
// float anchored to a point stays inside the surface; a modal layer with a backdrop blocks what is below it, sits
// above lower priorities whatever the opening order, and Escape closes the most recently shown overlay first.
import { createSignal, createNodeRef, render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { quit } from 'zinc:gfx';

const [menuOpen, setMenuOpen] = createSignal<boolean>(false);
const [modalOpen, setModalOpen] = createSignal<boolean>(false);
const trigger = createNodeRef(), menu = createNodeRef(), two = createNodeRef(), low = createNodeRef(), tip = createNodeRef();
const point = createNodeRef(), modal = createNodeRef(), modalBtn = createNodeRef(), plain = createNodeRef();
const r = (v: number): number => Math.round(v);
const box = (h: i32): string => ui.screenBox(h).map((v: number) => `${r(v)}`).join(',');
const log = (s: string): void => { console.log(s); };
const names = new Map<i32, string>();
const nameOf = (h: i32): string => h < 0 ? 'none' : names.get(h) ?? `#${h}`;

function App(): i32 {
  return <view class="flex-col h-full p-2 gap-2">
    <view class="flex-row gap-2">
      <view class="w-[80px] h-[30px] overflow-hidden bg-slate-700 p-1">
        <button ref={trigger} class="w-[60px] h-5" onClick={() => setMenuOpen(!menuOpen())}><text>Menu</text></button>
        <view ref={menu} class="flex-col w-[100px] bg-slate-800 p-1 gap-1" hidden={menuOpen() ? 0 : 1}>
          <button class="h-5" onClick={() => log('one')}><text>One</text></button>
          <button ref={two} class="h-5" onClick={() => { log('two'); setMenuOpen(false); }}><text>Two</text></button>
        </view>
      </view>
      <button ref={plain} class="w-[60px] h-5" onClick={() => log('plain')}><text>Plain</text></button>
    </view>
    <view class="grow" />
    <button ref={low} class="w-[60px] h-5" onClick={() => setModalOpen(true)}><text>Low</text></button>
    <view ref={tip} class="w-[120px] h-[40px] bg-amber-500" />
    <view ref={point} class="w-[90px] h-[30px] bg-emerald-500" />
    <view ref={modal} class="w-[160px] h-[80px] bg-slate-600 items-center justify-center" hidden={modalOpen() ? 0 : 1}>
      <button ref={modalBtn} class="w-[60px] h-5" onClick={() => setModalOpen(false)}><text>Close</text></button>
    </view>
  </view>;
}

function click(x: number, y: number): void { ui.pointerAt(x, y, true); ui.pointerAt(x, y, false); }
function clickNode(h: i32): void { const b = ui.screenBox(h); click(b[0] + b[2] / 2, b[1] + b[3] / 2); }

const steps: (() => void)[] = [];
let frame = 0;
render(App, 0x0f172a, (dt: number) => {
  frame++;
  if (frame === 1) {
    names.set(trigger.node, 'Menu'); names.set(two.node, 'Two'); names.set(plain.node, 'Plain'); names.set(modalBtn.node, 'Close'); names.set(low.node, 'Low');
    ui.openLayer(menu.node, { priority: 10 });
    ui.anchor(menu.node, trigger.node, 'bottom-start', 4);
    ui.onOutsidePointer(menu.node, (e: ui.PointerEvent) => { log(`outside the menu at ${r(e.gx)},${r(e.gy)}`); setMenuOpen(false); }, trigger.node);
    ui.onDismiss(menu.node, () => { log('dismiss menu'); setMenuOpen(false); });
    ui.openLayer(tip.node, { priority: 5 });
    ui.anchor(tip.node, low.node, 'bottom', 6);
    ui.openLayer(point.node, {});
    ui.anchorPoint(point.node, 315, 10);
    ui.openLayer(modal.node, { priority: 50, modal: true, backdrop: 0x000000 });
    ui.anchor(modal.node, low.node, 'top', 0);
    ui.onOutsidePointer(modal.node, (e: ui.PointerEvent) => { log('backdrop press'); setModalOpen(false); });
    ui.onDismiss(modal.node, () => { log('dismiss modal'); setModalOpen(false); });
    return;
  }
  if (frame - 2 < steps.length) steps[frame - 2](); else quit();
});

steps.push(() => {
  ui.pointerAt(0, 0, false);   // the test hooks drive the input from now on
  console.log('-- closed menu: nothing there');
  console.log('hit under the menu', nameOf(ui.hitAt(40, 50)));
  console.log('-- open: anchored under its button, outside the 80x30 clip, hit first');
  clickNode(trigger.node);
});
steps.push(() => {
  console.log('menu', box(menu.node), 'trigger', box(trigger.node));
  const t = ui.screenBox(two.node);
  console.log('Two', box(two.node), 'hit', nameOf(ui.hitAt(t[0] + t[2] - 5, t[1] + 5)));
  clickNode(two.node);
  console.log('open after Two', menuOpen());
  clickNode(trigger.node);
});
steps.push(() => {
  console.log('-- outside presses close it, the toggle button does not count as outside');
  click(300, 200);
  console.log('open', menuOpen());
  clickNode(trigger.node);
  console.log('open', menuOpen());
  clickNode(trigger.node);
  console.log('open', menuOpen());
  console.log('-- flip and clamp');
  console.log('low', box(low.node), 'tip (flipped above)', box(tip.node));
  console.log('point float (kept 8 px inside)', box(point.node));
  console.log(ui.dump());
  console.log('-- modal layer over the open menu, above it whatever the order');
  clickNode(trigger.node);
});
steps.push(() => { setModalOpen(true); });   // as a shortcut would (a click elsewhere would close the menu)
steps.push(() => {
  console.log('modal', box(modal.node), 'menu open', menuOpen(), 'modal open', modalOpen());
  const m = ui.screenBox(two.node);
  console.log('hit on Two under the modal backdrop', nameOf(ui.hitAt(m[0] + 5, m[1] + 5)), 'on Plain', nameOf(ui.hitAt(ui.screenBox(plain.node)[0] + 5, ui.screenBox(plain.node)[1] + 5)));
  console.log('hit on Close', nameOf(ui.hitAt(ui.screenBox(modalBtn.node)[0] + 5, ui.screenBox(modalBtn.node)[1] + 5)));
  console.log('-- Escape closes the latest overlay first');
  ui.keyDown(-1, 'Escape');
  console.log('menu open', menuOpen(), 'modal open', modalOpen());
  ui.keyDown(-1, 'Escape');
  console.log('menu open', menuOpen(), 'modal open', modalOpen());
  clickNode(low.node);
});
steps.push(() => {
  console.log('-- a press on the backdrop reaches the modal outside handler only');
  click(5, 5);
  console.log('modal open', modalOpen());
});
