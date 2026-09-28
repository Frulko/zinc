// The instruction banner: maneuver arrow, distance counting down, street, roundabout exit, lane guidance, and a
// "Then" chip when the following maneuver comes right after. A new instruction slides in: the old content slides
// up and fades (0.16 s), the banner switches to the next step, the new content rises from below with a small bounce.
import { createSignal, createEffect, Show } from 'zinc:ui/solid';
import { rect } from 'zinc:gfx';
import { steps } from '../route';
import { car, stepIndex, phase, maneuverText, PREVIEW, ARRIVED } from '../sim';
import { Tween, easeOut, easeOutBack } from '../motion';
import { drawManeuver, drawLane } from '../icons';

const [shown, setShown] = createSignal<i32>(1);
const swap = new Tween(1);   // 1 = content in place
const [distance, setDistance] = createSignal<string>('');
const [near, setNear] = createSignal<boolean>(false);   // the maneuver is less than 600 m away (lane guidance)

createEffect(() => {
  const next = stepIndex();
  if (next === shown()) return;
  swap.to(0, 0.16, easeOut, () => { setShown(next); swap.to(1, 0.38, easeOutBack); });
});

/** Per frame: the countdown of the step on the banner (sim.maneuverText). */
export function stepBanner(): void {
  const m = steps[shown()].at - car.d;
  setNear(m < 600);
  if (phase() === ARRIVED) { setDistance('Arrived'); return; }
  setDistance(maneuverText(m));
}

function title(): string {
  const s = steps[shown()];
  if (s.type === 'arrive') return s.street !== '' ? s.street : 'Destination';
  return s.street !== '' ? s.street : s.text;
}

/** Lanes of the shown step when its maneuver is less than 600 m away. */
function lanes(): string[] {
  const s = steps[shown()];
  const none: string[] = [];
  return s.lanes === '' || !near() ? none : s.lanes.split('|');
}

function LaneStrip(): i32 {
  const LANE: i32 = 34;
  return <View class="flex-row justify-center py-1.5 bg-[#0a4fa0]">
    <Canvas class={`h-[30px] w-[${lanes().length * LANE}px]`} onDraw={(x: i32, y: i32, w: i32, h: i32) => {
      const s = steps[shown()], ls = lanes();
      for (let i: i32 = 0; i < ls.length; i++) {
        if (i > 0) drawSeparator(x + i * LANE, y + 4, h - 8);
        const on = i < s.lanesOn.length && s.lanesOn.charCodeAt(i) === 49;
        drawLane(ls[i], x + i * LANE + 4, y + 2, LANE - 8, 0xffffff, on ? 255 : 80);
      }
    }} />
  </View>;
}
function drawSeparator(x: number, y: number, h: number): void {
  for (let k: i32 = 0; k < 3; k++) rect(x, y + k * h / 3, 1.5, h / 5, 0x7fb3ea);   // dashed lane line
}

function ThenChip(): i32 {
  const next = (): i32 => Math.min(shown() + 1, steps.length - 1);
  return <View class="flex-row">
    <View class="flex-row items-center gap-2 px-3 py-1.5 rounded-xl bg-[#0b3f80] shadow-md">
      <Text class="text-sm font-semibold text-sky-100">Then</Text>
      <Canvas class="w-[20px] h-[20px]" onDraw={(x: i32, y: i32, w: i32, h: i32) => drawManeuver(steps[next()], x, y, w, 0xffffff)} />
    </View>
  </View>;
}

export function Banner(): i32 {
  const soon = (): boolean => { const i = shown(); return i + 1 < steps.length && steps[i + 1].at - steps[i].at < 160 && steps[i + 1].type !== 'arrive'; };
  return <View class="flex-col gap-2" style={{ opacity: phase() === PREVIEW ? 0 : 1 }}>
    <View class="rounded-2xl overflow-hidden shadow-xl bg-gradient-to-b from-[#1a8cf0] to-[#0b62c9]" onPointerDown={() => {}}>
      <View class="flex-row items-center gap-4 pl-4 pr-5 py-3" style={{ opacity: swap.get(), translateY: (1 - swap.get()) * 18 }}>
        <Canvas class="w-[58px] h-[58px]" onDraw={(x: i32, y: i32, w: i32, h: i32) => drawManeuver(steps[shown()], x, y, w, 0xffffff)} />
        <View class="flex-col w-[178px] lg:w-[228px]">
          <View class="flex-row items-center gap-2">
            <Text class="text-3xl font-bold text-white tracking-tight">{distance()}</Text>
            <Show when={steps[shown()].type === 'roundabout'}>
              <View class="px-2 py-0.5 rounded-md bg-white/20"><Text class="text-sm font-bold text-white">{`Exit ${steps[shown()].exit}`}</Text></View>
            </Show>
          </View>
          <Text class="text-lg font-semibold text-sky-50">{title()}</Text>
        </View>
      </View>
      <Show when={lanes().length > 0}><LaneStrip /></Show>
    </View>
    <Show when={soon()}><ThenChip /></Show>
  </View>;
}
