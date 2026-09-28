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
    const r = b.r;
    shadow(x + b.x - r, y + b.y - r + 5, r * 2, r * 2, r, 8, 0x000000, night ? 80 : 32);
    rrect(x + b.x - r, y + b.y - r, r * 2, r * 2, r, b.color, 255);
    rrect(x + b.x - r * 0.5, y + b.y - r * 0.62, r * 0.55, r * 0.55, r * 0.275, 0xffffff, 60);   // round highlight
  }
  for (const s of sparks) {
    const r = 2 + 3 * s.life;
    rrect(x + s.x - r, y + s.y - r, r * 2, r * 2, r, s.color, Math.round(255 * Math.max(0, s.life)));
  }
}

export function Playground(): i32 {
  return <View class="grow flex-col gap-4 p-8">
    <View class="flex-row items-center gap-3" style={{ opacity: enter.at(0), translateY: (1 - enter.at(0)) * 12 }}>
      <Tabs items={['Gravity ↓', 'Zero-g', 'Gravity ↑']} selected={() => 1 - gravity()} onSelect={(i: i32) => setGravity(1 - i)} />
      <Button label="Shake" variant="secondary" onClick={() => shake()} />
      <Button label="Reset" variant="outline" onClick={() => { resetBalls(); toast('Playground reset', '12 fresh balls.'); }} />
      <View class="grow" />
      <Badge label="drag · throw · click" variant="outline" />
      <Text class={`text-sm font-semibold text-${theme().mutedForeground}`}>{`${ballCount()} balls`}</Text>
    </View>
    <View class={`grow rounded-2xl border overflow-hidden border-${theme().border}`}
      style={{ opacity: enter.at(0.1), translateY: (1 - enter.at(0.1)) * 20 }}>
      <Canvas class="grow cursor-grab" onDraw={drawScene}
        onPointerDown={(e: ui.PointerEvent) => press(e.x, e.y)}
        onPointerMove={(e: ui.PointerEvent) => drag(e.x, e.y)}
        onPointerUp={(e: ui.PointerEvent) => release()} />
    </View>
  </View>;
}
