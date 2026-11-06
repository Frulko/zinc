// The Mac's window. Alone it is a small browser; while it streams, the page is on the tablet and the window becomes its remote: a large
// address bar, the history buttons, shortcuts and what the tablet shows now.
import { For, Show, createNodeRef } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { NativeView, KeyEvent, PointerEvent } from 'zinc:ui';
import { SHORTCUTS, TARGETS, Shortcut, Target } from './constants';
import { web, typed, setTyped, screenHost, setScreenHost, streaming, connected, status, tabletUrl, controlling, setControlling, aspect, pointOnTablet, zoom, zoomStep, typeOnTablet, go, open, history, startStream, stopStream } from './state';

const BUTTON = 'px-3 h-9 rounded-md bg-slate-800 active:bg-slate-600 items-center justify-center';

function HistoryButtons(): i32 {
  return <View className="flex-row gap-2">
    <Button className={BUTTON} onClick={() => history('back')}><Text className="text-sm text-slate-200">◀</Text></Button>
    <Button className={BUTTON} onClick={() => history('forward')}><Text className="text-sm text-slate-200">▶</Text></Button>
    <Button className={BUTTON} onClick={() => history('reload')}><Text className="text-sm text-slate-200">Reload</Text></Button>
  </View>;
}

function ZoomButtons(): i32 {
  return <View className="flex-row gap-2 items-center">
    <Button className={BUTTON} onClick={() => zoomStep(-1)}><Text className="text-sm text-slate-200">−</Text></Button>
    <Button className="w-16 h-9 rounded-md bg-slate-800 active:bg-slate-600 items-center justify-center" onClick={() => zoomStep(0)}>
      <Text className="text-sm text-slate-200">{`${Math.round(zoom() * 100)} %`}</Text>
    </Button>
    <Button className={BUTTON} onClick={() => zoomStep(1)}><Text className="text-sm text-slate-200">+</Text></Button>
  </View>;
}

// While streaming, the keys no field of the window takes (the address bar has not the focus) are typed in the tablet's page
ui.onKey((e: KeyEvent) => {
  const mods = (e.shift ? 1 : 0) | (e.ctrl ? 2 : 0) | (e.alt ? 4 : 0) | (e.meta ? 8 : 0);
  if (typeOnTablet(e.key, e.key.length === 1 && !e.ctrl && !e.meta ? e.key : '', mods)) e.preventDefault();
});

function AddressBar(props: { large: boolean }): i32 {
  const field = props.large ? 'grow h-14 px-4 text-lg rounded-xl bg-slate-900 border border-slate-700 text-white focus:border-sky-500'
    : 'grow h-9 px-3 text-sm rounded-md bg-slate-900 border border-slate-700 text-white focus:border-sky-500';
  return <View className="flex-row grow gap-2 items-center" onSubmit={go}>
    <Input className={field} placeholder="Address or search" value={typed()} onInput={(v: string) => setTyped(v)} />
    <Button className={props.large ? 'px-6 h-14 rounded-xl bg-sky-600 active:bg-sky-400 items-center justify-center' : 'px-4 h-9 rounded-md bg-sky-600 active:bg-sky-400 items-center justify-center'} onClick={go}>
      <Text className={props.large ? 'text-lg text-white' : 'text-sm text-white'}>Go</Text>
    </Button>
  </View>;
}

function streamToAddress(): void {
  const host = screenHost().trim();
  if (host !== '') startStream(host);
}

function NetworkScreen(): i32 {
  return <View className="flex-row gap-2 px-2 pb-2 items-center bg-slate-900" onSubmit={streamToAddress}>
    <Text className="text-sm text-slate-400">Screen on the network</Text>
    <Input className="w-48 h-9 px-3 text-sm rounded-md bg-slate-950 border border-slate-700 text-white focus:border-sky-500" placeholder="192.168.1.20" value={screenHost()} onInput={(v: string) => setScreenHost(v)} />
    <Button className="px-3 h-9 rounded-md bg-emerald-700 active:bg-emerald-500 items-center justify-center" onClick={streamToAddress}>
      <Text className="text-sm text-white">Stream</Text>
    </Button>
  </View>;
}

function Browser(): i32 {
  return <View className="flex-col h-full">
    <View className="flex-row gap-2 p-2 items-center bg-slate-900 border-b border-slate-800">
      <HistoryButtons />
      <AddressBar large={false} />
      <ZoomButtons />
      <For each={TARGETS}>{(t: Target, _i: i32) =>
        <Button className="px-3 h-9 rounded-md bg-emerald-700 active:bg-emerald-500 items-center justify-center" onClick={() => startStream(t.host)}>
          <Text className="text-sm text-white">{'Stream to ' + t.label}</Text>
        </Button>}
      </For>
    </View>
    <NetworkScreen />
    <Show when={status() !== ''}><Text className="px-3 py-1 text-xs text-amber-400 bg-slate-900">{status()}</Text></Show>
    <NativeView className="grow" view={web} />
  </View>;
}

const padRef = createNodeRef();
const WHEEL_STEP = 40;   // points of the page a wheel step scrolls, as display-sidecar counts them
let leftDown = false;

/** Sends the mouse at e to the tablet, the pad's box standing for its screen. */
function point(kind: i32, e: PointerEvent, dx: number, dy: number): void {
  const b = ui.screenBox(padRef.node);
  pointOnTablet(kind, Math.max(0, Math.min(1, (e.gx - b[0]) / b[2])), Math.max(0, Math.min(1, (e.gy - b[1]) / b[3])), dx, dy);
}

/** The window as the screen's mouse: the pad has the screen's shape, what the mouse does on it happens on the page at the same place, and the
 *  keys go to the page (no field here takes them). */
function Control(): i32 {
  return <View className="flex-col h-full p-3 gap-3">
    <View className="flex-row items-center gap-3">
      <Text className="grow text-sm text-slate-300">Move, click and scroll here; the keyboard types in the page.</Text>
      <Button className={BUTTON} onClick={() => setControlling(false)}><Text className="text-sm text-slate-200">Done</Text></Button>
    </View>
    <View className="grow items-center justify-center overflow-hidden">
      <View ref={padRef} grab="keep" className="h-full max-w-full rounded-lg bg-slate-900 border border-slate-600 cursor-crosshair" style={{ aspectRatio: aspect() }}
        onPointerDown={(e: PointerEvent) => { if (e.button === 0) { leftDown = true; point(0, e, 0, 0); } }}
        onPointerMove={(e: PointerEvent) => point(leftDown ? 2 : 7, e, 0, 0)}
        onPointerUp={(e: PointerEvent) => { if (e.button === 0) { leftDown = false; point(1, e, 0, 0); } }}
        onContextMenu={(e: PointerEvent) => { point(5, e, 0, 0); point(6, e, 0, 0); }}
        onWheel={(e: PointerEvent) => point(3, e, e.wheelX * WHEEL_STEP, e.wheel * WHEEL_STEP)} />
    </View>
  </View>;
}

function Remote(): i32 {
  return <View className="flex-col h-full p-8 gap-6">
    <View className="flex-row items-center gap-4">
      <View className={connected() ? 'w-3 h-3 rounded-full bg-emerald-400' : 'w-3 h-3 rounded-full bg-amber-400'} />
      <View className="flex-col grow">
        <Text className="text-2xl font-semibold text-white">{connected() ? 'Streaming to the tablet' : 'Connecting...'}</Text>
        <Text className="text-sm text-slate-400">{status()}</Text>
      </View>
      <Button className="px-4 h-10 rounded-md bg-sky-600 active:bg-sky-400 items-center justify-center" onClick={() => setControlling(true)}>
        <Text className="text-sm text-white">Control</Text>
      </Button>
      <Button className="px-4 h-10 rounded-md bg-rose-700 active:bg-rose-500 items-center justify-center" onClick={stopStream}>
        <Text className="text-sm text-white">Stop streaming</Text>
      </Button>
    </View>
    <View className="flex-row gap-3 items-center">
      <HistoryButtons />
      <AddressBar large={true} />
    </View>
    <View className="flex-row gap-3 items-center">
      <ZoomButtons />
      <Text className="text-xs text-slate-400">Control: the mouse and the keyboard use the page. Pinch on the tablet to zoom in; click outside the address bar and type: the keys go to the page.</Text>
    </View>
    <View className="flex-col gap-1 p-4 rounded-xl bg-slate-900">
      <Text className="text-xs tracking-wider text-slate-500">ON THE TABLET NOW</Text>
      <Text className="text-lg text-sky-400">{tabletUrl()}</Text>
    </View>
    <Text className="text-xs tracking-wider text-slate-500">SHORTCUTS</Text>
    <View className="flex-row flex-wrap gap-3">
      <For each={SHORTCUTS}>{(s: Shortcut, _i: i32) =>
        <Button className="px-4 h-12 rounded-lg bg-slate-800 active:bg-slate-600 items-center justify-center" onClick={() => open(s.url)}>
          <Text className="text-sm text-slate-100">{s.label}</Text>
        </Button>}
      </For>
    </View>
    <View className="grow" />
    <Text className="text-xs text-slate-500">The page runs on this Mac and is drawn on the tablet; touch the tablet to use it.</Text>
  </View>;
}

export function Console(): i32 {
  return <View className="flex-col h-full bg-slate-950">
    <Show when={streaming()} fallback={<Browser />}><Show when={controlling()} fallback={<Remote />}><Control /></Show></Show>
  </View>;
}
