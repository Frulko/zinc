// Playground: balls under gravity on a canvas. Grab one and throw it; click empty space to pop sparks and drop a
// new ball. The toolbar changes gravity, shakes everything or resets. Physics lives in app/physics.ts.
import * as ui from 'zinc:ui';
import { theme, Button, Tabs, Badge } from 'zinc:ui/kit';
import { rect, rrect, shadow } from 'zinc:gfx';
import { entrances, PLAYGROUND } from '../app/router';
import { balls, sparks, resize, press, drag, release, shake, resetBalls, gravity, setGravity, ballCount } from '../app/physics';
import { dark } from '../app/prefs';
import { toast } from '../app/overlays';

const enter = entrances[PLAYGROUND];
let seeded = false;

function drawScene(x: i32, y: i32, w: i32, h: i32): void {
  resize(w, h);
  if (!seeded) { seeded = true; resetBalls(); }
  const night = dark();
  rect(x, y, w, h, night ? 0x18181b : 0xffffff);
  for (let gx = 40; gx < w; gx += 40) rect(x + gx, y, 1, h, night ? 0x27272a : 0xf4f4f5);
  for (let gy = 40; gy < h; gy += 40) rect(x, y + gy, w, 1, night ? 0x27272a : 0xf4f4f5);
  for (const b of balls) {
    // squash along the direction of the last impact (approximated: wider and flatter)
    const sx = b.r * (1 + b.squash * 0.25), sy = b.r * (1 - b.squash * 0.25);
    shadow(x + b.x - sx, y + b.y - sy + 6, sx * 2, sy * 2, sy, 10, 0x000000, night ? 90 : 40);
    rrect(x + b.x - sx, y + b.y - sy, sx * 2, sy * 2, Math.min(sx, sy), b.color, 255);
    rrect(x + b.x - sx * 0.45, y + b.y - sy * 0.6, sx * 0.5, sy * 0.35, sy * 0.17, 0xffffff, 70);   // highlight
  }
  for (const s of sparks) {
    const r = 2 + 3 * s.life;
    rrect(x + s.x - r, y + s.y - r, r * 2, r * 2, r, s.color, Math.round(255 * Math.max(0, s.life)));
  }
}

export function Playground(): i32 {
  return <View class="grow flex-col gap-4 p-8">
    <View class="flex-row items-center gap-3" style={{ opacity: enter.at(0), translateY: Math.round((1 - enter.at(0)) * 12) }}>
      <Tabs items={['Gravity ↓', 'Zero-g', 'Gravity ↑']} selected={() => 1 - gravity()} onSelect={(i: i32) => setGravity(1 - i)} />
      <Button label="Shake" variant="secondary" onClick={() => shake()} />
      <Button label="Reset" variant="outline" onClick={() => { resetBalls(); toast('Playground reset', '12 fresh balls.'); }} />
      <View class="grow" />
      <Badge label="drag · throw · click" variant="outline" />
      <Text class={`text-sm font-semibold text-${theme().mutedForeground}`}>{`${ballCount()} balls`}</Text>
    </View>
    <View class={`grow rounded-2xl border overflow-hidden border-${theme().border}`}
      style={{ opacity: enter.at(0.1), translateY: Math.round((1 - enter.at(0.1)) * 20) }}>
      <Canvas class="grow cursor-grab" onDraw={drawScene}
        onPointerDown={(e: ui.PointerEvent) => press(e.x, e.y)}
        onPointerMove={(e: ui.PointerEvent) => drag(e.x, e.y)}
        onPointerUp={(e: ui.PointerEvent) => release()} />
    </View>
  </View>;
}
