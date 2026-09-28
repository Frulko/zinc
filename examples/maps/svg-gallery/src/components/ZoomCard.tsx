// The compass redrawn at a new size every frame: vector documents are rasterized at runtime, never scaled bitmaps.
import { Card, CardHeader, CardContent } from 'zinc:ui/kit';
import { DOCUMENTS, COMPASS_INDEX } from '../documents';

let time = 0;

/** Advances the zoom animation (called every frame by main.tsx). */
export function tickZoom(dt: number): void {
  time += dt;
}

/** Canvas callback: the compass breathing between 60 px and the whole canvas, centred. */
function drawCompass(x: i32, y: i32, w: i32, h: i32): void {
  const zoom = 0.5 + 0.5 * Math.sin(time * 1.5);
  const side = 60 + zoom * (Math.min(w, h) - 60);
  DOCUMENTS[COMPASS_INDEX].svg.draw(x + (w - side) / 2, y + (h - side) / 2, side, side, 255);
}

export function ZoomCard(): i32 {
  return <Card class="w-80">
    <CardHeader title="Live zoom" description="Re-rendered at every frame's size." />
    <CardContent class="grow">
      <Canvas class="grow" onDraw={drawCompass} />
    </CardContent>
  </Card>;
}
