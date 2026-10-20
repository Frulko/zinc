// Scripted touch points (ZINC_INPUT `touch ID X Y`, `touchup ID`) as zinc:gfx reports them, one line per frame.
import { onFrame, touchCount, touchId, touchX, touchY, pointerX, pointerY, pointerDown } from 'zinc:gfx';

let n: i32 = 0;
onFrame((dt: number) => {
  let s = '';
  for (let i = 0; i < touchCount(); i++) s += ` ${touchId(i)}:${touchX(i)},${touchY(i)}`;
  console.log(`${n} touches=${touchCount()}${s} pointer=${pointerX()},${pointerY()},${pointerDown() ? 'down' : 'up'}`);
  n++;
});
