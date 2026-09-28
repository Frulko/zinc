// Everything else floating over the map: the speed bubble and limit sign, the control buttons, the report button
// and its menu, the alert card, the current street, Recenter, toasts and the arrival card.
import { Show } from 'zinc:ui/solid';
import { theme } from 'zinc:ui/kit';
import * as ui from 'zinc:ui';
import { tailwindColor } from 'zinc:ui';
import { speedKmh, limitKmh, playing, simSpeed, cycleSpeed, togglePlay, phase, PREVIEW, DRIVING, ARRIVED, street, etaClock, totalTime } from '../sim';
import { dark, toggleNight, restart, arriveIn } from '../app';
import { cameraMode, FREE, recenter } from '../camera';
import { alerts, cardIndex, cardDistance, cardIn, reportOpen, reportIn, toggleReport, report, toastText, toastIn, KIND_COLORS, POLICE, HAZARD, TRAFFIC } from '../alerts';
import { steps, formatDistance, routeLength } from '../route';
import { drawIcon, drawGlyph, drawFlag, PLAY_ICON, PAUSE_ICON, RESTART_ICON, MOON_ICON, SUN_ICON, RECENTER_ICON, REPORT_ICON } from '../icons';

function rgb(token: string): u32 { const c = tailwindColor(token); return c < 0 ? 0x71717a : c; }
const NO_PASS = (e: ui.PointerEvent): void => {};   // panels take the pointer: dragging on them does not pan the map
/** Horizontal extent of the map area (right of the side panel), for centred overlays: see camera.panelWidth. */
const MAP_AREA = 'left-0 right-0 md:left-[316px] lg:left-[368px]';

/** A round floating button (kit card colours) with a vector icon. */
function RoundButton(props: { icon: () => i32; onClick: () => void; size?: i32 }): i32 {
  const s = props.size ?? 48;
  return <View class={`rounded-full items-center justify-center shadow-md border cursor-pointer w-[${s}px] h-[${s}px] bg-${theme().card} border-${theme().border} active:bg-${theme().muted} focus:bg-${theme().card}`} onClick={props.onClick}>
    <Canvas class="w-[22px] h-[22px]" onDraw={(x: i32, y: i32, w: i32, h: i32) => drawIcon(props.icon(), x, y, w, rgb(theme().foreground))} />
  </View>;
}

export function Controls(): i32 {
  return <View class="absolute top-4 right-4 flex-col gap-3 items-center" onPointerDown={NO_PASS}>
    <RoundButton icon={() => dark() ? SUN_ICON : MOON_ICON} onClick={toggleNight} />
    <View class={`rounded-full items-center justify-center shadow-md border cursor-pointer w-[48px] h-[48px] bg-${theme().card} border-${theme().border} active:bg-${theme().muted} focus:bg-${theme().card}`} onClick={cycleSpeed}>
      <Text class={`text-base font-bold text-${theme().foreground}`}>{`×${simSpeed()}`}</Text>
    </View>
    <RoundButton icon={() => playing() && phase() === DRIVING ? PAUSE_ICON : PLAY_ICON} onClick={togglePlay} />
    <RoundButton icon={() => RESTART_ICON} onClick={restart} />
  </View>;
}

/** Current speed (red when over the limit) and the speed limit sign. */
export function SpeedBubble(): i32 {
  const over = (): boolean => speedKmh() > limitKmh() + 2;
  return <View class="flex-row items-center gap-2" style={{ opacity: phase() === PREVIEW ? 0 : 1 }}>
    <View class={`w-[66px] h-[66px] rounded-full items-center justify-center shadow-lg border transition-colors duration-300 ${over() ? 'bg-red-600 border-red-700' : `bg-${theme().card} border-${theme().border}`}`}>
      <Text class={`text-2xl font-bold ${over() ? 'text-white' : `text-${theme().foreground}`}`}>{`${speedKmh()}`}</Text>
      <Text class={`text-xs ${over() ? 'text-red-100' : `text-${theme().mutedForeground}`}`}>km/h</Text>
    </View>
    <View class="w-[50px] h-[50px] rounded-full items-center justify-center bg-white border-[5px] border-red-600 shadow-md">
      <Text class="text-lg font-bold text-zinc-900">{`${limitKmh()}`}</Text>
    </View>
  </View>;
}

/** The closest alert ahead, sliding in under the banner. */
export function AlertCard(): i32 {
  const a = (): i32 => Math.max(0, cardIndex());
  return <View class={`flex-row items-center gap-3 p-3 rounded-2xl shadow-lg border bg-${theme().card} border-${theme().border}`}
    style={{ opacity: Math.max(0, Math.min(1, cardIn.get())), translateX: (1 - cardIn.get()) * -60 }} onPointerDown={NO_PASS}>
    <View class="w-[44px] h-[44px] rounded-full items-center justify-center" bg={KIND_COLORS[alerts[a()].kind]}>
      <Canvas class="w-[26px] h-[26px]" onDraw={(x: i32, y: i32, w: i32, h: i32) => drawGlyph(alerts[a()].kind, x, y, w, 0xffffff, KIND_COLORS[alerts[a()].kind])} />
    </View>
    <View class="flex-col w-[112px] lg:w-[160px]">
      <Text class={`text-base font-bold text-${theme().foreground}`}>{alerts[a()].title}</Text>
      <Text class={`text-xs text-${theme().mutedForeground}`}>{alerts[a()].detail}</Text>
    </View>
    <Text class={`text-sm font-semibold text-${theme().foreground}`}>{cardDistance()}</Text>
  </View>;
}

function ReportChoice(props: { kind: i32; label: string }): i32 {
  return <View class="flex-col items-center gap-1.5 w-[72px] cursor-pointer" onClick={() => report(props.kind)}>
    <View class="w-[52px] h-[52px] rounded-full items-center justify-center shadow-md" bg={KIND_COLORS[props.kind]}>
      <Canvas class="w-[30px] h-[30px]" onDraw={(x: i32, y: i32, w: i32, h: i32) => drawGlyph(props.kind, x, y, w, 0xffffff, KIND_COLORS[props.kind])} />
    </View>
    <Text class={`text-xs font-semibold text-${theme().foreground}`}>{props.label}</Text>
  </View>;
}

/** Waze's orange report button, and the menu it opens above itself. */
export function Report(): i32 {
  return <View class="absolute bottom-4 right-4 flex-col items-end gap-3" onPointerDown={NO_PASS}>
    <Show when={reportOpen() || reportIn.get() > 0.01}>
      <View class={`flex-col gap-3 p-4 rounded-2xl shadow-xl border bg-${theme().card} border-${theme().border}`}
        style={{ opacity: Math.max(0, Math.min(1, reportIn.get())), translateY: (1 - reportIn.get()) * 24 }}>
        <Text class={`text-sm font-bold text-${theme().foreground}`}>Report</Text>
        <View class="flex-row gap-2">
          <ReportChoice kind={POLICE} label="Police" />
          <ReportChoice kind={HAZARD} label="Hazard" />
          <ReportChoice kind={TRAFFIC} label="Traffic" />
        </View>
      </View>
    </Show>
    <View class="w-[62px] h-[62px] rounded-full items-center justify-center shadow-xl cursor-pointer bg-gradient-to-b from-[#ffb020] to-[#ff7a00] focus:bg-orange-500" onClick={toggleReport}>
      <Canvas class="w-[30px] h-[30px]" onDraw={(x: i32, y: i32, w: i32, h: i32) => drawIcon(REPORT_ICON, x, y, w, 0xffffff)} />
    </View>
  </View>;
}

/** Bottom centre of the map area: Recenter (after panning) above the current street name. */
export function MapFooter(): i32 {
  return <View class={`absolute bottom-5 ${MAP_AREA} flex-col items-center gap-3`}>
    <Show when={cameraMode() === FREE}>
      <View class="flex-row items-center gap-2 px-4 h-11 rounded-full shadow-lg cursor-pointer bg-gradient-to-b from-[#29a5f5] to-[#0b6fd6] focus:bg-sky-600" onClick={recenter} onPointerDown={NO_PASS}>
        <Canvas class="w-[18px] h-[18px]" onDraw={(x: i32, y: i32, w: i32, h: i32) => drawIcon(RECENTER_ICON, x, y, w, 0xffffff)} />
        <Text class="text-base font-bold text-white">Recenter</Text>
      </View>
    </Show>
    <Show when={phase() === DRIVING && street() !== ''}>
      <View class={`px-4 py-1.5 rounded-full shadow-md ${dark() ? "bg-slate-600" : "bg-[#15202b]/90"}`}>
        <Text class="text-sm font-semibold text-white">{street()}</Text>
      </View>
    </Show>
  </View>;
}

export function Toast(): i32 {
  return <View class={`absolute top-4 ${MAP_AREA} flex-row justify-center`} style={{ opacity: Math.max(0, Math.min(1, toastIn.get())), translateY: (1 - toastIn.get()) * -30 }}>
    <View class="px-4 py-2.5 rounded-xl shadow-lg bg-[#15202b]/95">
      <Text class="text-sm font-semibold text-white">{toastText()}</Text>
    </View>
  </View>;
}

/** OpenStreetMap data needs its attribution on screen. */
export function Attribution(): i32 {
  return <View class={`absolute bottom-1 right-[88px] px-1.5 rounded ${dark() ? 'bg-slate-900/60' : 'bg-white/70'}`}>
    <Text class={`text-xs ${dark() ? 'text-slate-400' : 'text-zinc-500'}`}>© OpenStreetMap contributors</Text>
  </View>;
}

/** The arrival card (the confetti are drawn on the map canvas). */
export function Arrival(): i32 {
  const minutes = Math.round(totalTime / 60);
  return <Show when={phase() === ARRIVED}>
    <View class={`absolute top-[84px]${MAP_AREA} flex-row justify-center`} style={{ opacity: Math.max(0, Math.min(1, arriveIn.get())), translateY: (1 - arriveIn.get()) * 40 }}>
      <View class={`flex-col items-center gap-2 px-8 py-6 rounded-3xl shadow-xl border bg-${theme().card} border-${theme().border}`}>
        <View class="w-[64px] h-[64px] rounded-full items-center justify-center bg-gradient-to-b from-[#34d17a] to-[#14a05a] shadow-md">
          <Canvas class="w-[36px] h-[36px]" onDraw={(x: i32, y: i32, w: i32, h: i32) => drawFlag(x, y, w, 0xffffff)} />
        </View>
        <Text class={`text-2xl font-bold text-${theme().foreground}`}>You have arrived!</Text>
        <Text class={`text-base text-${theme().mutedForeground}`}>{steps[steps.length - 1].street}</Text>
        <Text class={`text-sm text-${theme().mutedForeground}`}>{`${formatDistance(routeLength)} · about ${minutes} min · ${etaClock()}`}</Text>
        <View class="flex-row items-center justify-center h-11 px-6 mt-2 rounded-xl cursor-pointer bg-gradient-to-b from-[#29a5f5] to-[#0b6fd6] focus:bg-sky-600" onClick={restart}>
          <Text class="text-base font-bold text-white">Drive again</Text>
        </View>
      </View>
    </View>
  </Show>;
}
