// The bottom sheet (kit card style): in the preview, the route summary and Go (with the auto-start countdown);
// while driving, the arrival time, time and distance left, and a pull-up list of every step (the current one
// highlighted; passed ones leave the list). The list's height follows `sheetT`, so it unfolds with a small bounce.
import { Show, For, createMemo } from 'zinc:ui/solid';
import { height } from 'zinc:gfx';
import { theme } from 'zinc:ui/kit';
import { Step, steps, formatDistance, routeLength } from '../route';
import { phase, PREVIEW, ARRIVED, stepIndex, etaClock, etaMinutes, distanceLeft, totalTime } from '../sim';
import { go, sheetT, toggleSheet, sheetOpen, countdown, AUTO_GO } from '../app';
import { drawManeuver, drawIcon, UP_ICON, DOWN_ICON } from '../icons';
import { tailwindColor } from 'zinc:ui';

const ROW: i32 = 64;   // about one step row
const NONE: i32[] = [];
function rgb(token: string): u32 { const c = tailwindColor(token); return c < 0 ? 0x71717a : c; }
/** Height of the unfolded list: what is left of the screen under the banner. */
function listHeight(): number { return Math.max(110, Math.min(steps.length * ROW, height() - 390)); }

function StepRow(props: { index: i32 }): i32 {
  const i = props.index, s: Step = steps[i];
  const current = (): boolean => stepIndex() === i;
  const gap = s.at - steps[i - 1].at;
  return <View className={`flex-row items-center gap-3 px-3 py-2.5 rounded-xl ${current() ? `bg-${theme().accentSoft}` : ''}`}>
    <Canvas className="w-[26px] h-[26px]" onDraw={(x: i32, y: i32, w: i32, h: i32) => drawManeuver(s, x, y, w, rgb(current() ? theme().accentSoftForeground : theme().foreground))} />
    <View className="flex-col w-[200px] lg:w-[252px]">
      <Text className={`text-sm font-semibold text-${theme().foreground}`}>{s.type === 'arrive' ? `Arrive at ${s.street}` : s.text}</Text>
      <Text className={`text-xs text-${theme().mutedForeground}`}>{`in ${formatDistance(gap)}`}</Text>
    </View>
  </View>;
}

function Preview(): i32 {
  return <View className="flex-col gap-3 p-4">
    <View className="flex-row items-end gap-3">
      <Text className="text-3xl font-bold text-emerald-600 tracking-tight">{`${Math.round(totalTime / 60)} min`}</Text>
      <Text className={`text-lg text-${theme().mutedForeground} pb-0.5`}>{formatDistance(routeLength)}</Text>
    </View>
    <Text className={`text-sm text-${theme().mutedForeground}`}>Fastest route now · via Champs-Élysées and the Seine</Text>
    <View className="flex-row items-center justify-center h-12 rounded-xl bg-gradient-to-b from-[#29a5f5] to-[#0b6fd6] shadow-md cursor-pointer focus:bg-sky-600" onClick={go}>
      <Text className="text-lg font-bold text-white">{countdown() <= AUTO_GO ? `Go  ·  ${countdown()}` : 'Go'}</Text>
    </View>
  </View>;
}

function Driving(): i32 {
  // the steps still ahead, the current one first (a memo: the list changes only when a maneuver is passed)
  const ahead = createMemo<i32[]>((): i32[] => {
    const out: i32[] = [];
    for (let i: i32 = stepIndex(); i < steps.length; i++) out.push(i);
    return out;
  }, NONE);
  return <View className="flex-col">
    <View className="flex-row items-center gap-4 pl-5 pr-3 py-3 cursor-pointer" onClick={toggleSheet}>
      <View className="flex-col">
        <Text className="text-3xl font-bold text-emerald-600 tracking-tight">{etaClock()}</Text>
        <Text className={`text-xs text-${theme().mutedForeground}`}>arrival</Text>
      </View>
      <View className="flex-col grow">
        <Text className={`text-lg font-semibold text-${theme().foreground}`}>{phase() === ARRIVED ? "Arrived" : `${etaMinutes()} min`}</Text>
        <Text className={`text-sm text-${theme().mutedForeground}`}>{distanceLeft()}</Text>
      </View>
      <View className={`w-10 h-10 rounded-full items-center justify-center bg-${theme().muted}`}>
        <Canvas className="w-[22px] h-[22px]" onDraw={(x: i32, y: i32, w: i32, h: i32) => drawIcon(sheetOpen() ? DOWN_ICON : UP_ICON, x, y, w, rgb(theme().foreground))} />
      </View>
    </View>
    <View className={`overflow-hidden h-[${Math.round(Math.max(0, sheetT.get()) * listHeight())}px]`}>
      <View className={`border-t border-${theme().border}`} />
      <ScrollView className={`h-[${Math.round(listHeight())}px] p-2`}>
        <For each={ahead()}>{(i: i32) => <StepRow index={i} />}</For>
      </ScrollView>
    </View>
  </View>;
}

export function Sheet(): i32 {
  return <View className={`rounded-2xl shadow-xl border bg-${theme().card} border-${theme().border}`} onPointerDown={() => {}}>
    <Show when={phase() === PREVIEW} fallback={<Driving />}><Preview /></Show>
  </View>;
}
