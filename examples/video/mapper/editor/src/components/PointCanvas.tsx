// A canvas of points: what the output and the surface views share. A click selects (Shift adds), a drag moves, arrows move by 1 pixel and with Shift by 10, Tab goes to the next point.
import * as ui from 'zinc:ui';
import { HIT_RADIUS } from '../constants';
import { EditablePoint, PointEditor, hitPoint } from '../model/pointEditor';
import { store, touchPoint } from '../state';

export interface PointCanvasProps {
  className: string;
  editor: PointEditor;
  points: () => EditablePoint[];
  pixelSize: () => number[];          // what 1.0 is worth in pixels, for the arrows
  draw: (x: i32, y: i32, w: i32, h: i32) => void;
  onEmpty?: (x: number, y: number) => void;
  onShiftPoint?: (index: i32) => void;   // replaces the selection on a shift-click (a mask takes the point out)
}

export function PointCanvas(props: PointCanvasProps): i32 {
  let w = 1, h = 1;
  let dragging = false, lastX = 0, lastY = 0;

  const down = (e: ui.PointerEvent): void => {
    const x = e.x / w, y = e.y / h;
    const all = props.points();
    const hit = hitPoint(all, x, y, w, h, HIT_RADIUS);
    const shift = (e.mods & ui.SHIFT) !== 0;
    if (hit < 0) {
      if (!shift) props.editor.clear();
      if (props.onEmpty !== undefined) (props.onEmpty as (x: number, y: number) => void)(x, y);
    } else if (shift && props.onShiftPoint !== undefined) {
      (props.onShiftPoint as (index: i32) => void)(hit);
      props.editor.clear();
    } else {
      props.editor.pick(hit, shift);
      dragging = !shift;
      lastX = x;
      lastY = y;
    }
    touchPoint();
  };
  const move = (e: ui.PointerEvent): void => {
    if (!dragging) return;
    const x = e.x / w, y = e.y / h;
    props.editor.move(props.points(), x - lastX, y - lastY);
    lastX = x;
    lastY = y;
    touchPoint();
  };
  const key = (e: ui.KeyEvent): void => {
    const size = props.pixelSize();
    const step = e.shift ? store.options.coarseStep : store.options.fineStep;
    let dx = 0, dy = 0;
    if (e.key === 'ArrowLeft') dx = -1;
    else if (e.key === 'ArrowRight') dx = 1;
    else if (e.key === 'ArrowUp') dy = -1;
    else if (e.key === 'ArrowDown') dy = 1;
    else if (e.key === 'Tab') props.editor.step(props.points().length as i32, e.shift);
    else if (e.key === 'Escape') props.editor.clear();
    else return;
    if (dx !== 0 || dy !== 0) props.editor.move(props.points(), dx * step / size[0], dy * step / size[1]);
    e.preventDefault();
    touchPoint();
  };
  return <Canvas className={`${props.className} ${store.options.focusRing ? '' : 'outline-none'}`} focusable grab="keep"
    onPointerDown={down} onPointerMove={move} onPointerUp={(e: ui.PointerEvent) => { dragging = false; }} onKeyDown={key}
    onDraw={(x: i32, y: i32, width: i32, height: i32) => {
      w = width;
      h = height;
      props.draw(x, y, width, height);
    }} />;
}
