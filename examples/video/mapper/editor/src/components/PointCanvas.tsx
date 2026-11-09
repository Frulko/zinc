// Shared geometric editing: view navigation never changes a point or a projector command.
import * as ui from 'zinc:ui';
import { createNodeRef, createSignal, onCleanup, onMount } from 'zinc:ui/solid';
import { DRAG_THRESHOLD, HIT_RADIUS } from '../constants';
import { EditablePoint, PointEditor, hitPoint } from '../model/pointEditor';
import { store, touchPoint } from '../state';
import { CanvasTools } from './CanvasTools';

export interface PointCanvasProps {
  className: string;
  readOnly?: boolean;
  editor: PointEditor;
  points: () => EditablePoint[];
  pixelSize: () => number[];
  draw: (x: i32, y: i32, w: i32, h: i32) => void;
  onEmpty?: (x: number, y: number, w: number, h: number) => void;
  onShiftPoint?: (index: i32) => void;
  aspect?: () => number;
  whole?: WholeShape;
  onMaximize?: () => void;
  onRestore?: () => boolean;
}

export interface WholeShape {
  grab: (x: number, y: number) => boolean;
  move: (dx: number, dy: number) => void;
}

enum Gesture { Idle, Points, WholePending, WholeMoving, Pan }

export function PointCanvas(props: PointCanvasProps): i32 {
  const canvas = createNodeRef();
  const [zoom, setZoom] = createSignal(1);
  const [pan, setPan] = createSignal(false);
  const [step, setStep] = createSignal(store.options.fineStep);
  let viewportWidth = 1, viewportHeight = 1, w = 1, h = 1, left = 0, top = 0;
  let offsetX = 0, offsetY = 0, spaceHeld = false;
  let gesture = Gesture.Idle, lastX = 0, lastY = 0, pressX = 0, pressY = 0;

  const transition = (next: Gesture): void => {
    if (next === Gesture.WholeMoving && gesture !== Gesture.WholePending && gesture !== Gesture.WholeMoving) throw new Error('No whole-shape gesture');
    gesture = next;
  };
  onMount(() => { onCleanup(ui.onFocusWithin(canvas.node, (focused: boolean) => {
    if (!focused) { spaceHeld = false; transition(Gesture.Idle); }
  })); });
  const layout = (): void => {
    const aspect = props.aspect !== undefined ? (props.aspect as () => number)() : viewportWidth / viewportHeight;
    const fitWidth = Math.min(viewportWidth, viewportHeight * aspect);
    w = Math.max(1, Math.round(fitWidth * zoom()));
    h = Math.max(1, Math.round(fitWidth / aspect * zoom()));
    left = Math.round((viewportWidth - w) / 2 + offsetX);
    top = Math.round((viewportHeight - h) / 2 + offsetY);
  };
  const fit = (): void => {
    transition(Gesture.Idle);
    offsetX = offsetY = 0;
    setZoom(1);
    layout();
    ui.repaint();
  };
  const zoomAt = (factor: number, x: number, y: number): void => {
    transition(Gesture.Idle);
    const u = (x - left) / w, v = (y - top) / h;
    setZoom(Math.max(0.25, Math.min(16, zoom() * factor)));
    layout();
    offsetX += x - (left + u * w);
    offsetY += y - (top + v * h);
    layout();
    ui.repaint();
  };
  const next = (backwards: boolean): void => {
    transition(Gesture.Idle);
    props.editor.step(props.points().length as i32, backwards);
    touchPoint();
    ui.focusNode(canvas.node);
  };
  const nudge = (dx: number, dy: number, amount: number): void => {
    if (pan() || props.readOnly === true) return;
    const size = props.pixelSize();
    if (size[0] <= 0 || size[1] <= 0) return;
    if (props.editor.selection.length === 0 && props.whole !== undefined) (props.whole as WholeShape).move(dx * amount / size[0], dy * amount / size[1]);
    else props.editor.move(props.points(), dx * amount / size[0], dy * amount / size[1]);
    touchPoint();
  };
  const down = (e: ui.PointerEvent): void => {
    transition(Gesture.Idle);
    if (props.readOnly === true) return;
    if (e.button === 1 || spaceHeld || pan()) {
      transition(Gesture.Pan);
      lastX = e.x; lastY = e.y;
      return;
    }
    if (e.button !== 0) return;
    const x = (e.x - left) / w, y = (e.y - top) / h;
    const hit = hitPoint(props.points(), x, y, w, h, HIT_RADIUS);
    if (hit < 0) {
      if (!e.shift) props.editor.clear();
      if (!e.shift && props.whole !== undefined && (props.whole as WholeShape).grab(x, y)) {
        transition(Gesture.WholePending);
        pressX = lastX = x; pressY = lastY = y;
      } else if (props.onEmpty !== undefined) (props.onEmpty as (x: number, y: number, w: number, h: number) => void)(x, y, w, h);
    } else if (e.shift && props.onShiftPoint !== undefined) {
      (props.onShiftPoint as (index: i32) => void)(hit);
      props.editor.clear();
    } else {
      props.editor.pick(hit, e.shift);
      if (!e.shift) transition(Gesture.Points);
      lastX = x; lastY = y;
    }
    touchPoint();
  };
  const move = (e: ui.PointerEvent): void => {
    if (props.readOnly === true) return;
    if (gesture === Gesture.Pan) {
      offsetX += e.x - lastX; offsetY += e.y - lastY;
      lastX = e.x; lastY = e.y;
      layout(); ui.repaint();
      return;
    }
    const x = (e.x - left) / w, y = (e.y - top) / h;
    if (gesture === Gesture.WholePending || gesture === Gesture.WholeMoving) {
      if (gesture === Gesture.WholePending && Math.hypot((x - pressX) * w, (y - pressY) * h) < DRAG_THRESHOLD) return;
      transition(Gesture.WholeMoving);
      (props.whole as WholeShape).move(x - lastX, y - lastY);
    } else if (gesture === Gesture.Points) props.editor.move(props.points(), x - lastX, y - lastY);
    else return;
    lastX = x; lastY = y;
    touchPoint();
  };
  const key = (e: ui.KeyEvent): void => {
    if (props.readOnly === true) return;
    if (e.key === 'Tab') { spaceHeld = false; transition(Gesture.Idle); return; }
    if (e.key === ' ' && !e.primary) spaceHeld = true;
    else if (e.key === '0') fit();
    else if (e.key === '+' || e.key === '=') zoomAt(1.25, viewportWidth / 2, viewportHeight / 2);
    else if (e.key === '-') zoomAt(1 / 1.25, viewportWidth / 2, viewportHeight / 2);
    else if (e.key.toLowerCase() === 'f' && !e.primary && props.onMaximize !== undefined) { transition(Gesture.Idle); spaceHeld = false; (props.onMaximize as () => void)(); }
    else if (e.key === 'Escape') {
      spaceHeld = false; transition(Gesture.Idle);
      if (props.onRestore === undefined || !(props.onRestore as () => boolean)()) props.editor.clear();
    } else if (e.key.toLowerCase() === 'n' && !e.primary) next(e.shift);
    else {
      const amount = e.shift ? store.options.coarseStep : step();
      if (e.key === 'ArrowLeft') nudge(-1, 0, amount);
      else if (e.key === 'ArrowRight') nudge(1, 0, amount);
      else if (e.key === 'ArrowUp') nudge(0, -1, amount);
      else if (e.key === 'ArrowDown') nudge(0, 1, amount);
      else return;
    }
    e.preventDefault(); touchPoint();
  };
  return <View className={`${props.className} overflow-hidden`}>
    {props.readOnly !== true && <CanvasTools zoom={zoom} fit={fit} zoomBy={(factor: number) => zoomAt(factor, viewportWidth / 2, viewportHeight / 2)} pan={pan} togglePan={() => { transition(Gesture.Idle); spaceHeld = false; setPan(!pan()); }} step={step} setStep={(amount: number) => { if (Number.isFinite(amount) && amount > 0 && amount <= 1000) setStep(amount); }} move={(x: number, y: number) => nudge(x, y, step())} next={() => next(false)} />}
    <View className="w-full h-0 grow overflow-hidden">
    <Canvas ref={canvas} className={`w-full h-full ${props.readOnly === true ? 'cursor-default' : pan() ? 'cursor-grab' : 'cursor-crosshair'} ${props.readOnly === true ? '' : store.options.focusRing ? 'focus:ring-2' : 'focus-visible:ring-2'}`} focusable={props.readOnly !== true} grab="keep"
      onPointerDown={down} onPointerMove={move} onPointerUp={(e: ui.PointerEvent) => {
        if (gesture === Gesture.WholePending && props.onEmpty !== undefined) (props.onEmpty as (x: number, y: number, w: number, h: number) => void)(pressX, pressY, w, h);
        transition(Gesture.Idle);
      }} onPointerCancel={(e: ui.PointerEvent) => { transition(Gesture.Idle); spaceHeld = false; }}
      onWheel={(e: ui.PointerEvent) => { if (props.readOnly !== true) zoomAt(Math.pow(1.1, e.wheel) * e.pinch, e.x, e.y); }}
      onKeyDown={key} onKeyUp={(e: ui.KeyEvent) => { if (e.key === ' ') spaceHeld = false; }}
      onDraw={(x: i32, y: i32, width: i32, height: i32) => {
        viewportWidth = Math.max(1, width); viewportHeight = Math.max(1, height);
        layout();
        props.draw((x + left) as i32, (y + top) as i32, w as i32, h as i32);
      }} />
    </View>
  </View>;
}
