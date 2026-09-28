// Gesture arbitration and multitouch through the test hooks (docs/ui.md, Gestures): in a vertical scroll view, a
// horizontal onDrag row keeps horizontal moves and loses vertical ones to the scroll; a raw onPointerDown node gets
// onPointerCancel when the scroll takes over, unless grab="keep"; taps, long presses, clicks after small moves;
// two fingers pinch (scale, rotation, centroid), and a second finger takes the grab from a running scroll.
import { createNodeRef, render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { quit } from 'zinc:gfx';

const scroll = createNodeRef(), swipe = createNodeRef(), raw = createNodeRef(), keep = createNodeRef();
const tap = createNodeRef(), btn = createNodeRef(), pinch = createNodeRef();
const r = (v: number): number => Math.round(v);
const r2 = (v: number): number => Math.round(v * 100) / 100;
const log = (s: string): void => { console.log(s); };

function Rows(): i32 {
  return <view class="flex-col gap-1 p-1">
    <view ref={swipe} class="h-5 bg-sky-500" dragAxis="x"
      onDrag={(e: ui.PointerEvent) => log(`swipe drag phase=${e.phase} dx=${r(e.dx)} dy=${r(e.dy)} x=${r(e.x)}`)} />
    <view ref={raw} class="h-5 bg-rose-500"
      onPointerDown={(e: ui.PointerEvent) => log(`raw down ${r(e.x)},${r(e.y)}`)}
      onPointerMove={(e: ui.PointerEvent) => log(`raw move ${r(e.x)},${r(e.y)}`)}
      onPointerUp={(e: ui.PointerEvent) => log(`raw up`)}
      onPointerCancel={(e: ui.PointerEvent) => log(`raw cancel ${r(e.x)},${r(e.y)}`)} />
    <view ref={keep} class="h-5 bg-amber-500" grab="keep"
      onPointerDown={(e: ui.PointerEvent) => log(`keep down`)}
      onPointerMove={(e: ui.PointerEvent) => log(`keep move ${r(e.y)}`)}
      onPointerUp={(e: ui.PointerEvent) => log(`keep up`)}
      onPointerCancel={(e: ui.PointerEvent) => log(`keep cancel`)} />
    <view ref={tap} class="h-5 bg-emerald-500"
      onTap={(e: ui.PointerEvent) => log(`tap ${r(e.x)},${r(e.y)}`)}
      onLongPress={(e: ui.PointerEvent) => log(`long press ${r(e.x)},${r(e.y)}`)} />
    <button ref={btn} class="h-5" onClick={() => log('click')}><text>Button</text></button>
    <view class="h-[600px] bg-slate-700" />
  </view>;
}

function App(): i32 {
  return <view class="flex-col h-full">
    <scroll ref={scroll} class="h-[140px]"><Rows /></scroll>
    <view ref={pinch} class="grow bg-violet-500"
      onPinch={(e: ui.PointerEvent) => log(`pinch phase=${e.phase} scale=${r2(e.scale)} rot=${r2(e.rotation)} at ${r(e.x)},${r(e.y)}`)}
      onTap={(e: ui.PointerEvent) => log('pinch area tap')} />
  </view>;
}

/** Centre of a node on the surface. */
function mid(h: i32): number[] { const b = ui.screenBox(h); return [b[0] + b[2] / 2, b[1] + b[3] / 2]; }
/** A pointer drag from p by (dx, dy) in `steps` moves, then released. */
function drag(p: number[], dx: number, dy: number, steps: i32): void {
  ui.pointerAt(p[0], p[1], true);
  for (let i = 1; i <= steps; i++) ui.pointerAt(p[0] + dx * i / steps, p[1] + dy * i / steps, true);
  ui.pointerAt(p[0] + dx, p[1] + dy, false);
}
function reset(title: string): void {
  ui.scrollTo(scroll.node, 0, 0);
  console.log(`-- ${title}`);
}

let frame = 0;
render(App, 0x0f172a, (dt: number) => {
  frame++;
  if (frame !== 2) return;
  ui.pointerAt(0, 0, false);   // the test hooks drive the input from now on
  reset('horizontal swipe on a dragAxis="x" row: the row drags, the list stays');
  drag(mid(swipe.node), 40, 3, 4);
  console.log('scrollTop', r(ui.scrollTop(scroll.node)));
  reset('vertical move on the same row: the scroll takes it');
  drag(mid(swipe.node), 2, -60, 4);
  console.log('scrollTop', r(ui.scrollTop(scroll.node)));
  reset('raw onPointerDown row: cancelled when the scroll takes over');
  drag(mid(raw.node), 0, -40, 4);
  console.log('scrollTop', r(ui.scrollTop(scroll.node)));
  reset('grab="keep": the row keeps the pointer, the list stays');
  drag(mid(keep.node), 0, -40, 2);
  console.log('scrollTop', r(ui.scrollTop(scroll.node)));
  reset('tap, then a long press (no tap after it)');
  drag(mid(tap.node), 3, 2, 1);
  const t = mid(tap.node);
  ui.pointerAt(t[0], t[1], true);
  ui.tick(300);
  console.log('after 300 ms');
  ui.tick(300);
  ui.pointerAt(t[0], t[1], false);
  reset('button: a small move still clicks, a scroll does not');
  drag(mid(btn.node), 3, -4, 2);
  drag(mid(btn.node), 0, -50, 4);
  console.log('scrollTop', r(ui.scrollTop(scroll.node)));
  reset('pinch: two fingers spread and turn');
  const c = mid(pinch.node);
  ui.touchAt(1, c[0] - 50, c[1], 0);
  ui.touchAt(2, c[0] + 50, c[1], 0);
  ui.touchAt(2, c[0] + 150, c[1], 1);
  ui.touchAt(1, c[0] - 50, c[1] - 100, 1);
  ui.touchAt(2, c[0] + 150, c[1], 2);
  ui.touchAt(1, c[0] - 50, c[1] - 100, 2);
  reset('one finger taps the pinch area');
  ui.touchAt(5, c[0], c[1], 0);
  ui.touchAt(5, c[0], c[1], 2);
  reset('a second finger does not pinch where nothing has onPinch');
  const s = mid(raw.node);
  ui.touchAt(1, s[0], s[1], 0);
  ui.touchAt(2, s[0] + 30, s[1], 0);
  ui.touchAt(1, s[0], s[1] - 30, 1);
  ui.touchAt(2, s[0] + 30, s[1], 2);
  ui.touchAt(1, s[0], s[1] - 30, 2);
  console.log('scrollTop', r(ui.scrollTop(scroll.node)));
  quit();
});
