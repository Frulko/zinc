// Player input, read once per frame: pad / keyboard buttons and the mouse. The pointer only steers the paddle
// after it has moved, so a mouse resting on the window does not fight the arrow keys.
import { isDown, wasPressed, pointerX, pointerDown, Btn } from 'zinc:gfx';

export interface Controls {
  confirm: boolean;       // Space / Enter / pad A or Start (or a click outside play)
  click: boolean;         // pointer pressed this frame
  left: boolean;
  right: boolean;
  pointerMoved: boolean;
  pointerX: number;
}

let lastPointerX = -1;

export function readControls(): Controls {
  const x = pointerX();
  const moved = lastPointerX >= 0 && x !== lastPointerX;
  lastPointerX = x;
  return {
    confirm: wasPressed(Btn.A) || wasPressed(Btn.Start),
    click: pointerDown(),
    left: isDown(Btn.Left),
    right: isDown(Btn.Right),
    pointerMoved: moved,
    pointerX: x,
  };
}
