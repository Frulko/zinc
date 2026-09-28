// Benchmark page: the scene canvas with a live fps readout, the scene picker, the object count and a full run.
import { Button, Slider } from 'zinc:ui/kit';
import { rrect, font, drawText, textWidth } from 'zinc:gfx';
import { Panel, Segmented, tk, rgb } from '../components/ui';
import { SCENES, MAX_OBJECTS, scene, setScene, count, setCount, benchFps, results, runningScene, startRun, xs, ys } from '../app/bench';

const COLORS: u32[] = [0x6366f1, 0xec4899, 0xf59e0b, 0x10b981, 0x0ea5e9, 0xef4444, 0x8b5cf6, 0x14b8a6];
let label: i32 = -1, big: i32 = -1;

function drawScene(x: number, y: number, w: number, h: number, fg: u32, pill: u32): void {
  if (label < 0) { label = font('sans-bold', 12); big = font('sans-bold', 20); }
  const n: i32 = Math.round(count()), s = scene();
  for (let i = 0; i < n; i++) {
    const kind = s === 3 ? i % 3 : s;
    const c = COLORS[i % COLORS.length];
    const px = x + 12 + xs[i] * (w - 24), py = y + 12 + ys[i] * (h - 24);
    if (kind === 0) rrect(px - 11, py - 11, 22, 22, 5, c, 255);
    else if (kind === 1) rrect(px - 14, py - 14, 28, 28, 14, c, 140);
    else drawText(label, px - 14, py - 8, 'Zinc', c, 255, 0);
  }
  const f = `${benchFps()}`;
  const tw = textWidth(big, f, 0);
  rrect(x + 6, y + 6, tw + 40, 28, 8, pill, 220);
  drawText(big, x + 14, y + 9, f, fg, 255, 0);
  drawText(label, x + 18 + tw, y + 15, 'fps', fg, 180, 0);
}

function resultText(): string {
  const r = results();
  if (runningScene() >= 0) return `Measuring ${SCENES[runningScene()]}…`;
  if (r[0] < 0) return 'Run: 3 s per scene, average fps';
  return SCENES.map((name: string, i: i32) => `${name} ${r[i]}`).join(' · ');
}

export function Bench(): i32 {
  return <View class="flex-col grow p-2 gap-2">
    <Panel class="grow overflow-hidden">
      <Canvas class="grow" onDraw={(x: i32, y: i32, w: i32, h: i32) => drawScene(x, y, w, h, rgb(tk().foreground), rgb(tk().muted))} />
    </Panel>
    <Segmented items={SCENES} selected={scene} onSelect={setScene} />
    <View class="flex-row items-center gap-2 px-1">
      <Text class={`w-[48] text-xs text-${tk().mutedForeground}`}>Objects</Text>
      <Slider value={count} onChange={setCount} min={4} max={MAX_OBJECTS} step={4} class="w-[128]" />
      <Text class={`w-5 text-xs font-semibold text-${tk().foreground}`}>{`${Math.round(count())}`}</Text>
    </View>
    <View class="flex-row items-center gap-2">
      <Button label="Run" size="sm" onClick={() => { if (runningScene() < 0) startRun(); }} />
      <Text class={`grow text-[10px] text-${tk().mutedForeground}`}>{resultText()}</Text>
    </View>
  </View>;
}
