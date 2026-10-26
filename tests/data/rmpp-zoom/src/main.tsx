// rmpp_sim fixture: a ZoomView in picture mode on the reMarkable driver. The driver draws the pinch's ghost itself (display.ghost): the view
// the app commits when the fingers lift is the zoom the last ghost showed.
import { render } from 'zinc:ui/solid';
import { ZoomView } from 'zinc:ui/kit';
import { rect } from 'zinc:gfx';

let zoom = 1;
function grid(x: i32, y: i32, w: i32, h: i32): void {
  rect(x, y, w, h, 0xffffff);
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if ((i + j) % 2 === 0) rect(x + i * 200 * zoom, y + j * 200 * zoom, 200 * zoom, 200 * zoom, 0x000000);
}
async function setView(f: number, cx: number, cy: number, dx: number, dy: number): Promise<void> { zoom *= f; console.log(`view ${Math.round(zoom * 100)}`); }
render(() => <ZoomView className="w-full h-full" zoom={() => zoom} maxZoom={4} draw={grid} onView={setView} />, 0xffffff, null);
