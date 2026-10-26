/** @jsxHelpers ./host */
// zinc:ui/kit — ZoomView: pinch, pan, double tap and Ctrl+wheel zoom, done once for every app (docs/reports/engine-gestures-zoom-refresh.md).
// While the fingers move, the content is not drawn again: picture mode keeps the content's last picture and only scales and moves it (one
// blit a frame), content mode scales its children by paint (no layout). When they lift, onView tells the app the zoom factor and the move;
// the app draws its sharp picture at the new view (a page rendered again, a shot fetched) and returns once it is drawn. The frames say so
// to an e-ink panel (refreshIntent of zinc:gfx): the fast waveform while the picture follows the fingers, one clean refresh after.
//
//   <ZoomView className="grow" zoom={() => view.zoom} maxZoom={4} draw={pageView}
//     onView={async (f, cx, cy, dx, dy) => { await setView(view.zoom * f, cx, cy, dx, dy); }} onSwipe={(dx, dy) => turn(dy < 0 ? 1 : -1)} />
import { createSignal } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { renderSlot } from './host';
import { createImage, destroyImage, beginImage, endImage, drawImageRect, rect, refreshIntent } from 'zinc:gfx';

export interface ZoomViewProps {
  className?: string;
  /** The committed zoom, 1 fits the content (the app's own value in picture mode; content mode keeps its own when absent). */
  zoom?: () => number;
  minZoom?: number;
  maxZoom?: number;
  /** Picture mode: draws the content at the committed view into (x, y, w, h); never called while a gesture moves (once at its start, for
   *  the picture it moves). It may read the pen there, as a Canvas onDraw does. */
  draw?: (x: i32, y: i32, w: i32, h: i32) => void;
  /** Picture mode: an image the app keeps of what `draw` shows, the view's size (zinc:ink's `img` after drawOver); the gesture moves it
   *  instead of a picture recorded from `draw`, which must then not draw into an image itself (images are not recorded nested). */
  picture?: () => i32;
  /** Content mode: the children, scaled around the view's top-left corner by the committed zoom. */
  children?: () => i32;
  /** The gesture ended: the view zoomed by `factor` around (cx, cy) of the view, then moved by (dx, dy) view pixels. Resolves once the app
   *  drew its picture at that view: the clean refresh waits for it. */
  onView?: (factor: number, cx: number, cy: number, dx: number, dy: number) => Promise<void>;
  /** A one-finger drag when the content is not zoomed in (no live move): a swipe, (dx, dy) view pixels. */
  onSwipe?: (dx: number, dy: number) => void;
  onTap?: (x: number, y: number) => void;
  /** The wheel without Ctrl or Cmd: steps, + up. */
  onWheel?: (steps: number) => void;
  /** true while the pointer is the pen writing: no gesture starts. */
  writing?: () => boolean;
}

let draws: i32 = 0;
/** How many times ZoomViews called their `draw` (tests: none while a gesture moves but the one for its picture). */
export function zoomViewDraws(): i32 { return draws; }

export function ZoomView(props: ZoomViewProps): i32 {
  const minZ = props.minZoom !== undefined ? props.minZoom as number : 1, maxZ = props.maxZoom !== undefined ? props.maxZoom as number : 4;
  const [own, setOwn] = createSignal<number>(1);
  const zoom = (): number => props.zoom !== undefined ? (props.zoom as () => number)() : own();
  // the live transform: a view point p shows at (p - (mx, my)) * s + (mx, my) + (tx, ty)
  const [live, setLive] = createSignal<boolean>(false);
  const [s, setS] = createSignal<number>(1);
  const [tx, setTx] = createSignal<number>(0);
  const [ty, setTy] = createSignal<number>(0);
  let mx: number = 0, my: number = 0, dragging = false, ignored = false;
  let snap: i32 = -1, sw: i32 = 0, sh: i32 = 0, snapDue = false;

  const begin = (x: number, y: number): void => { mx = x; my = y; setS(1); setTx(0); setTy(0); snapDue = true; setLive(true); };
  const finish = (f: number, dx: number, dy: number): void => {
    const cx = mx, cy = my;
    setLive(false);
    if (props.zoom === undefined) setOwn(Math.max(minZ, Math.min(maxZ, own() * f)));
    if (props.onView === undefined) { refreshIntent('settle'); return; }
    (props.onView as (f: number, cx: number, cy: number, dx: number, dy: number) => Promise<void>)(f, cx, cy, dx, dy)
      .then((): void => { refreshIntent('settle'); });
  };
  const zoomBy = (f: number, x: number, y: number): void => {
    const z = zoom(), g = Math.max(minZ / z, Math.min(maxZ / z, f));
    if (g === 1) return;
    mx = x; my = y;
    refreshIntent('interactive');
    finish(g, 0, 0);
  };

  const pinch = (e: ui.PointerEvent): void => {
    if (e.phase === 0) { begin(e.x, e.y); return; }
    const z = zoom();
    const k = Math.max(minZ / z, Math.min(maxZ / z, e.scale));
    if (e.phase === 1) { setS(k); setTx(e.x - mx); setTy(e.y - my); return; }
    ui.holdSettle();   // the sharp picture comes with onView
    if (e.phase === 2) finish(k, e.x - mx, e.y - my); else finish(1, 0, 0);
  };
  const drag = (e: ui.PointerEvent): void => {
    if (e.phase === 0) {
      ignored = props.writing !== undefined && (props.writing as () => boolean)();
      dragging = !ignored && zoom() > 1;
      if (dragging) { refreshIntent('interactive'); begin(0, 0); }
      return;
    }
    if (ignored) return;
    if (dragging) {
      if (e.phase === 1) { setTx(e.dx); setTy(e.dy); return; }
      dragging = false;
      if (e.phase === 2) finish(1, e.dx, e.dy); else finish(1, 0, 0);
      return;
    }
    if (e.phase === 2 && props.onSwipe !== undefined) (props.onSwipe as (dx: number, dy: number) => void)(e.dx, e.dy);
  };
  const tap = (e: ui.PointerEvent): void => {
    if (props.writing !== undefined && (props.writing as () => boolean)()) return;
    if (e.clicks === 2) { zoomBy(zoom() > 1 ? 1 / zoom() : 2 / zoom(), e.x, e.y); return; }   // double tap: fit, or twice
    if (props.onTap !== undefined) (props.onTap as (x: number, y: number) => void)(e.x, e.y);
  };
  const wheel = (e: ui.PointerEvent): void => {
    if (e.pinch !== 1) { zoomBy(e.pinch, e.x, e.y); return; }   // a trackpad's pinch
    if (e.ctrl || e.meta) { zoomBy(e.wheel > 0 ? 1.25 : 0.8, e.x, e.y); return; }
    if (props.onWheel !== undefined) (props.onWheel as (steps: number) => void)(e.wheel);
  };

  if (props.draw === undefined) {   // content mode: paint-only scale and move of the children
    // ponytail: the children are painted again each frame of the gesture (no layout); a recorded picture of the subtree (as the scroll
    // tiles of zinc:ui keep) would make it one blit, when a content-mode app needs it
    return <View className={`overflow-hidden ${props.className ?? ''}`} onPinch={pinch} onDrag={drag} onTap={tap} onWheel={wheel}>
      <View scale={live() ? zoom() * s() : zoom()} translateX={live() ? mx * (1 - s()) + tx() : 0} translateY={live() ? my * (1 - s()) + ty() : 0}>
        {renderSlot(props.children)}
      </View>
    </View>;
  }
  const paint = (x: i32, y: i32, w: i32, h: i32): void => {
    const d = props.draw as (x: i32, y: i32, w: i32, h: i32) => void;
    if (!live()) { draws++; d(x, y, w, h); return; }
    let img = props.picture !== undefined ? (props.picture as () => i32)() : -1;
    if (img >= 0) snapDue = false;
    else {
      if (snapDue) {   // the picture the gesture moves: what the view showed when it started
        if (snap < 0 || sw !== w || sh !== h) { if (snap >= 0) destroyImage(snap); snap = createImage(w, h); sw = w; sh = h; }
        beginImage(snap);
        draws++; d(0, 0, w, h);
        endImage();
        snapDue = false;
      }
      img = snap;
    }
    const k = s();
    rect(x, y, w, h, 0xffffff);
    drawImageRect(img, 0, 0, w, h, x + mx * (1 - k) + tx(), y + my * (1 - k) + ty(), w * k, h * k);
  };
  return <Canvas className={props.className ?? ''} onDraw={paint} onPinch={pinch} onDrag={drag} onTap={tap} onWheel={wheel} />;
}
