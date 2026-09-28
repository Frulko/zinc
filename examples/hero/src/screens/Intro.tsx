// The title screen shown at launch: a drawn backdrop whose glow follows the pointer, the title arriving letter by
// letter with a bounce, a tagline, feature pills and two actions. "Get started" (or Enter) zooms it away.
import * as ui from 'zinc:ui';
import { Show } from 'zinc:ui/solid';
import { theme, Button, Badge } from 'zinc:ui/kit';
import { rect, rrect } from 'zinc:gfx';
import { introEntrance, introOut, introShown, leaveIntro } from '../app/router';
import { Spring, easeOutBack } from '../app/motion';
import { seconds } from '../app/clock';
import { accentTint, dark } from '../app/prefs';
import { showShortcuts } from '../app/commands';

const TITLE: string[] = ['Z', 'i', 'n', 'c'];
const FEATURES: string[] = ['TypeScript → C++', 'No JS engine', '60 fps software renderer', 'Solid & React models', 'Runs on a Pi 1'];

// the big glow eases toward the pointer (canvas coordinates)
const glowX = new Spring(-1, 40, 12), glowY = new Spring(-1, 40, 12);

function drawBackdrop(x: i32, y: i32, w: i32, h: i32): void {
  const night = dark();
  rect(x, y, w, h, night ? 0x09090b : 0xfafafa);
  if (glowX.get() < 0) { glowX.snap(w * 0.3); glowY.snap(h * 0.4); }
  const t = seconds();
  const glow = (cx: number, cy: number, r: number, color: u32): void => {
    for (let k = 12; k >= 1; k--) { const rr = r * k / 12; rrect(cx - rr, cy - rr, rr * 2, rr * 2, rr, color, night ? 5 : 8); }
  };
  glow(x + glowX.get(), y + glowY.get(), h * 0.5, accentTint());
  glow(x + w * 0.75 + Math.cos(t * 0.3) * 50, y + h * 0.65 + Math.sin(t * 0.4) * 30, h * 0.4, 0xfbcfe8);
  const dot: u32 = night ? 0x27272a : 0xe4e4e7;
  for (let gy = 28; gy < h; gy += 28) for (let gx = 28; gx < w; gx += 28) rect(x + gx, y + gy, 2, 2, dot);
}

/** One title letter: rises with an overshoot, staggered. */
function Letter(props: { ch: string; index: i32 }): i32 {
  const delay = 0.08 + props.index * 0.045;
  const p = (): number => easeOutBack(introEntrance.raw(delay, 0.45));
  return <Text class={`text-6xl font-bold text-${theme().foreground}`}
    style={{ opacity: introEntrance.at(delay, 0.2), translateY: (1 - p()) * 40 }}>{props.ch}</Text>;
}

function Pill(props: { label: string; index: i32 }): i32 {
  const d = 0.4 + props.index * 0.035;
  return <View class={`px-3 h-8 rounded-full items-center justify-center border bg-${theme().card} border-${theme().border}`}
    style={{ opacity: introEntrance.at(d), translateY: (1 - introEntrance.at(d)) * 12 }}>
    <Text class={`text-sm text-${theme().mutedForeground}`}>{props.label}</Text>
  </View>;
}

export function Intro(): i32 {
  introEntrance.restart();
  const out = (): number => introOut.get();
  return <View class="absolute inset-0" style={{ hidden: introShown() ? 0 : 1, opacity: 1 - out() }}>
    <Show when={introShown()}><View class="absolute inset-0">
    <Canvas class="absolute inset-0" onDraw={drawBackdrop}
      onPointerMove={(e: ui.PointerEvent) => { glowX.to(e.x); glowY.to(e.y); }} />
    <View class="absolute inset-0 flex-col items-center justify-center gap-6 p-8"
      style={{ translateY: -out() * 60 }}>
      <View style={{ opacity: introEntrance.at(0), translateY: (1 - introEntrance.at(0)) * 16 }}>
        <Badge label="Zinc 0.1 · compiled, not interpreted" variant="accent" />
      </View>
      <View class="flex-row">
        {TITLE.map((ch: string, i: i32) => <Letter ch={ch} index={i} />)}
      </View>
      <Text class={`text-xl text-center text-${theme().mutedForeground}`}
        style={{ opacity: introEntrance.at(0.28), translateY: (1 - introEntrance.at(0.28)) * 16 }}>
        Native apps from TypeScript. Screens, transitions, physics and charts, all in this demo.
      </Text>
      <View class="flex-row flex-wrap justify-center gap-2 w-[640]">
        {FEATURES.map((f: string, i: i32) => <Pill label={f} index={i} />)}
      </View>
      <View class="flex-row gap-3 pt-4" style={{ opacity: introEntrance.at(0.55), translateY: (1 - introEntrance.at(0.55)) * 16 }}>
        <Button label="Get started  →" size="lg" onClick={() => leaveIntro()} />
        <Button label="Keyboard shortcuts" size="lg" variant="outline" onClick={() => showShortcuts()} />
      </View>
      <Text class={`text-xs text-${theme().mutedForeground}`} style={{ opacity: introEntrance.at(0.8) * 0.7 }}>
        Press Enter to continue
      </Text>
    </View>
    </View></Show>
  </View>;
}
