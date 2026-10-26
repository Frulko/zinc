// kit_zoomview fixture: a ZoomView in picture mode over a grid of squares, pinched by two scripted fingers. The draw callback logs the frame
// it runs in: during the pinch it runs once (the picture the gesture moves), then once a frame again at the committed view.
import { render } from 'zinc:ui/solid';
import { ZoomView } from 'zinc:ui/kit';
import { rect, frame } from 'zinc:gfx';

let zoom = 1, ox = 0, oy = 0;
function grid(x: i32, y: i32, w: i32, h: i32): void {
  console.log(`draw ${frame()}`);
  rect(x, y, w, h, 0xffffff);
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    if ((i + j) % 2 !== 0) continue;
    rect(x + ox + i * 40 * zoom, y + oy + j * 40 * zoom, 40 * zoom, 40 * zoom, i === 3 && j === 3 ? 0xd03030 : 0x3050c0);
  }
}
async function setView(f: number, cx: number, cy: number, dx: number, dy: number): Promise<void> {
  zoom *= f; ox = (ox - cx) * f + cx + dx; oy = (oy - cy) * f + cy + dy;
  console.log(`view ${Math.round(zoom * 100)} ${Math.round(ox)} ${Math.round(oy)}`);
}
function App(): i32 {
  return <ZoomView className="w-full h-full" zoom={() => zoom} maxZoom={4} draw={grid} onView={setView} />;
}
render(App, 0xffffff, null);
