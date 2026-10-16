// The table in 3D beside the top view, and the game played in it. The picture is the game's own scene (play.ts builds it from the
// document), seen as the table's landscape layout looks at it; it follows every edit. A ball is dropped on the top view (the drop
// tool), or a game is started as a player starts one; the game then runs here with the table's physics, rules and sounds, and can be
// paused and stepped a frame at a time. The same game can be shown in a window of its own, drawn there as the game itself draws
// it: the table and its score panel.
// While no game runs, the pane is also where the eye of a layout is set by hand: a drag turns the view around what it looks at, a
// drag with Shift slides it over the table, the wheel comes closer; "frame" shows the whole board again, and "use this view" writes
// the eye into the layout the pane shows (landscape, or portrait when the pane is taller than wide).
import { createSignal, createEffect, For, Show, renderWindow } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { rect, closeWindow, windowOpen } from 'zinc:gfx';
import { Camera } from 'zinc:3d';
import { Phase } from '../../pinball3d/src/game';
import { View as TableView } from '../../pinball3d/src/view';
import { drawPanel, grouped } from '../../pinball3d/src/panel';
import { rgb } from './shapes';
import { doc, table, advanced, setCamera, say } from './state';
import { view3d, setView3d, playing, paused, dropping, setDropping, moved, sceneNow, gameNow, gameIfAny, aim, play, pause, stop, stepFrame, events, setWindowControls } from './play';
import { Tool, Segmented } from './widgets';
import * as L from './strings';
import { t, f } from './strings';

/** The box of the 3D view in the window, as it was last drawn: where a touch plays the game, as on the game's own view. */
export let boxX: number = 0, boxY: number = 0, boxW: number = 0, boxH: number = 0;
/** Why the table cannot be shown in 3D ('' when it can): a model file that is not in its folder, for one. */
function problem(): string { doc(); try { sceneNow(); return ''; } catch (e) { return `${(e as Error).message}`; } }

/** The eye of the pane while it is set by hand: where it is, then what it looks at, in table coordinates (six numbers); empty
 *  while the pane looks at the table as its layout does. */
const [eye3d, setEye3d] = createSignal<number[]>([]);
/** The layout the pane looks through, when one was chosen ('' until then: the one of the pane's shape). */
const [paneLayout, setPaneLayout] = createSignal<string>('');
/** Whether the pane is taller than wide, as it was last drawn. */
const [tall, setTall] = createSignal<boolean>(true);
/** The layout the pane shows: the one chosen, else the portrait layout for a pane taller than wide and the landscape one otherwise. */
function shown(): string { return paneLayout() !== '' ? paneLayout() : tall() ? 'portrait' : 'landscape'; }
/** The eye as it is now: the one set by hand, else the layout's. */
function eyeNow(): number[] {
  const free = eye3d();
  if (free.length === 6) return free;
  const c = shown() === 'portrait' ? table().layouts.portrait.camera : table().layouts.landscape.camera;
  return [c.position[0], c.position[1], c.position[2], c.target[0], c.target[1], c.target[2]];
}
/** The eye put `dist` away from what it looks at, `yaw` round the table (0: from the player's side) and `pitch` above it (radians). */
function eyeAt(tx: number, ty: number, tz: number, dist: number, yaw: number, pitch: number): void {
  const p = Math.max(0.12, Math.min(1.5, pitch)), d = Math.max(20, Math.min(900, dist));
  setEye3d([tx + Math.sin(yaw) * Math.cos(p) * d, ty + Math.cos(yaw) * Math.cos(p) * d, tz + Math.sin(p) * d, tx, ty, tz]);
}
/** Turns the eye around what it looks at (dx, dy: pixels dragged), slides it over the table, or brings it closer by a factor. */
function turnEye(dx: number, dy: number, slide: boolean, closer: number): void {
  const e = eyeNow(), ox = e[0] - e[3], oy = e[1] - e[4], oz = e[2] - e[5], dist = Math.sqrt(ox * ox + oy * oy + oz * oz);
  const yaw = Math.atan2(ox, oy), pitch = Math.asin(Math.max(-1, Math.min(1, oz / dist)));
  if (!slide) { eyeAt(e[3], e[4], e[5], dist * closer, yaw - dx * 0.008, pitch + dy * 0.006); return; }
  // over the table, the way the pointer goes: what is looked at moves the other way, along the eye's right and its way in
  const k = dist * 0.0016;
  eyeAt(e[3] - (Math.cos(yaw) * dx + Math.sin(yaw) * dy) * k, e[4] - (Math.cos(yaw) * dy - Math.sin(yaw) * dx) * k, e[5], dist, yaw, pitch);
}
/** The whole board again, from the side the eye is on. */
function frameEye(): void {
  const e = eyeNow(), tb = table(), ox = e[0] - e[3], oy = e[1] - e[4], oz = e[2] - e[5], dist = Math.sqrt(ox * ox + oy * oy + oz * oz);
  const fov = (shown() === 'portrait' ? tb.layouts.portrait.camera.fov : tb.layouts.landscape.camera.fov) * Math.PI / 180;
  eyeAt(tb.playfield.width / 2, tb.playfield.length / 2, 0, tb.playfield.length * 0.56 / Math.tan(fov / 2), Math.atan2(ox, oy), Math.asin(Math.max(-1, Math.min(1, oz / dist))));
}
/** Writes the eye set by hand into the layout the pane shows; the pane then looks as that layout does again. */
export function useView(): void {
  const e = eye3d(), r = (v: number): number => Math.round(v * 10) / 10;
  if (e.length !== 6) return;
  if (setCamera(shown(), [r(e[0]), r(e[1]), r(e[2])], [r(e[3]), r(e[4]), r(e[5])])) say(f(L.DONE_VIEW_USED, t(shown() === 'portrait' ? L.PORTRAIT_LAYOUT : L.LANDSCAPE_LAYOUT)));
  setEye3d([]);
}
let turning = false, lastX = 0, lastY = 0;

function draw(x: i32, y: i32, w: i32, h: i32): void {
  boxX = x; boxY = y; boxW = w; boxH = h;
  if ((h > w) !== tall()) queueMicrotask(() => setTall(boxH > boxW));   // no signal is written while views are drawn
  try {
    const s = sceneNow(), layouts = table().layouts, e = eye3d();
    aim(s.camera, shown() === 'portrait' ? layouts.portrait : layouts.landscape, w, h);
    // the scene swaps the table's y (down the table) and z (up) for the engine's axes
    if (e.length === 6) { s.camera.setPosition(e[0], e[2], e[1]).lookAt(e[3], e[5], e[4]); s.camera.up[0] = 0; s.camera.up[1] = 1; s.camera.up[2] = 0; }
    s.render(x, y, w, h);
  } catch (e) { rect(x, y, w, h, 0x09090b); }
}
/** The score of the game being played and what it asks for next, in a line. */
function score(): string {
  moved();
  const g = gameIfAny();
  if (g === null || g.phase !== Phase.Play) return '';
  const step = g.rules.currentStep();
  return `${grouped(g.rules.score)}   ·   ${f(L.BALL_N, `${g.rules.ball}`)}${step === null ? '' : `   ·   ${step.text}`}`;
}
/** The last lines of the game's log. */
function lastEvents(): string[] { moved(); return events.slice(Math.max(0, events.length - 7)); }
/** The switch between the two things the pane beside the top view can show. */
export function PaneSwitch(): i32 {
  return <View className="w-[112]"><Segmented options={['heights', '3d']} labels={[t(L.PROFILE), '3D']} value={() => view3d() ? '3d' : 'heights'} onPick={(v: string) => setView3d(v === '3d')} /></View>;
}
const never = (): boolean => false;
function key(k: string): () => string { return (): string => advanced() ? k : ''; }

export function Pane3D(): i32 {
  // the picture is drawn by hand: ask for it again when the table or the game moved
  createEffect(() => { doc(); moved(); playing(); paused(); eye3d(); paneLayout(); tall(); ui.repaint(); });
  // the pointer plays the game while one runs (a touch is a flipper button); otherwise it sets the eye
  const free = (): boolean => !playing() || paused();
  return <View className="grow basis-0 min-w-0 flex-col bg-zinc-950 border-l border-zinc-800">
    <View className="flex-row items-center gap-1 h-9 px-2 shrink-0 bg-zinc-900 border-b border-zinc-800">
      <PaneSwitch />
      <View className="grow" />
      <Show when={!playing() || paused()}><Tool icon="play" label="" look="primary" keys={key('P')} off={never} onClick={play} /></Show>
      <Show when={playing() && !paused()}><Tool icon="pause" label="" look="plain" keys={key('P')} off={never} onClick={pause} /></Show>
      <Tool icon="step-forward" label="" look="quiet" keys={key('O')} off={() => !playing() || !paused()} onClick={stepFrame} />
      <Tool icon="square" label="" look="quiet" keys={key('Esc')} off={() => !playing()} onClick={stop} />
      <Show when={!dropping()}><Tool icon="circle-arrow-down" label="" look="quiet" keys={key('B')} off={never} onClick={() => setDropping(true)} /></Show>
      <Show when={dropping()}><Tool icon="circle-arrow-down" label="" look="primary" keys={key('B')} off={never} onClick={() => setDropping(false)} /></Show>
      <Tool icon="app-window" label="" look="quiet" keys={key('W')} off={never} onClick={toggleWindow} />
    </View>
    <View className="grow basis-0 min-h-0 relative overflow-hidden cursor-default"
      onPointerDown={(e: ui.PointerEvent) => { turning = free() && e.button === 0; lastX = e.x; lastY = e.y; }}
      onPointerMove={(e: ui.PointerEvent) => { if (turning) { turnEye(e.x - lastX, e.y - lastY, e.shift, 1); lastX = e.x; lastY = e.y; } }}
      onPointerUp={(e: ui.PointerEvent) => { turning = false; }}
      onWheel={(e: ui.PointerEvent) => { if (free() && e.wheel !== 0) turnEye(0, 0, false, e.wheel > 0 ? 1 / 1.1 : 1.1); }}>
      <Canvas className="absolute inset-0" style={{ lazy: 1 }} onDraw={draw} />
      {/* the eye: which layout the pane looks through, the whole board again, and what to do with a view set by hand */}
      <Show when={free() && problem() === ''}>
        <View className="absolute left-[10] top-[10] flex-col gap-1 p-1 rounded-md bg-zinc-900 border border-zinc-700">
          <View className="flex-row items-center gap-1">
            <View className="w-[170]"><Segmented options={['landscape', 'portrait']} labels={[t(L.LANDSCAPE_LAYOUT), t(L.PORTRAIT_LAYOUT)]} value={shown} onPick={(v: string) => { setPaneLayout(v); setEye3d([]); }} /></View>
            <Tool icon="scan" label="" look="quiet" keys={key('')} off={never} onClick={frameEye} />
          </View>
          <Show when={eye3d().length === 6}>
            <View className="flex-row items-center gap-1">
              <Tool icon="camera" label={t(L.USE_VIEW)} look="primary" keys={key('C')} off={never} onClick={useView} />
              <Tool icon="rotate-ccw" label="" look="quiet" keys={key('')} off={never} onClick={() => setEye3d([])} />
            </View>
          </Show>
        </View>
      </Show>
      <Show when={score() !== ''}>
        <View className="absolute left-[10] top-[10] right-[10] flex-row px-2 py-1 rounded bg-zinc-900 border border-zinc-700"><Text className="grow basis-0 text-xs font-bold text-amber-300">{score()}</Text></View>
      </Show>
      <Show when={problem() !== ''}>
        <View className="absolute left-[10] right-[10] top-[10] flex-row px-3 py-2 rounded-md bg-zinc-900 border border-red-900"><Text className="grow basis-0 text-xs text-red-300">{f(L.NO_3D, problem())}</Text></View>
      </Show>
      <Show when={!playing()}>
        <View className="absolute left-[10] right-[10] bottom-[10] flex-row px-3 py-2 rounded-md bg-zinc-900 border border-zinc-700">
          <Text className="grow basis-0 text-[11px] text-zinc-400">{dropping() ? t(L.DROP_HOW) : eye3d().length === 6 ? t(L.EYE_HOW) : t(L.PLAY_HOW)}</Text>
        </View>
      </Show>
      <Show when={playing() && lastEvents().length > 0}>
        <View className="absolute left-[10] right-[10] bottom-[10] flex-col px-2 py-1 rounded bg-zinc-900 border border-zinc-700">
          <For each={lastEvents()}>{(line: string, i: i32) => <Text className="truncate font-mono text-[10px] text-zinc-300" style={{ maxWidth: 320 }}>{line}</Text>}</For>
        </View>
      </Show>
    </View>
  </View>;
}

// ---------------------------------------------------------------- the game in a window of its own

let win: i32 = -1;
const eye = new Camera();
/** The window as the game itself draws one: the layout that fits its shape, the table and the score panel. */
function PlayWindow(): i32 {
  return <View className="relative w-full h-full">
    <Canvas className="absolute inset-0" onDraw={(x: i32, y: i32, w: i32, h: i32) => {
      const tb = table();
      rect(x, y, w, h, rgb(tb.lighting.background));
      try {
        const g = gameNow(), s = sceneNow(), v = new TableView(tb, w, h, ''), l = v.layout;
        aim(eye, l, v.w(l.view), v.h(l.view));
        eye.render(s.scene, x + v.x(l.view), y + v.y(l.view), v.w(l.view), v.h(l.view));
        drawPanel(v, g, t(L.KEYS_OF_GAME));
        // the keys pressed in this window play the game too
        setWindowControls(x + v.x(l.view), y + v.y(l.view), v.w(l.view), v.h(l.view));
      } catch (e) { }   // the pane beside the top view says why
    }} />
  </View>;
}
/** Opens the window of the game, or closes it. */
export function toggleWindow(): void {
  if (win >= 0 && windowOpen(win)) { closeWindow(win); win = -1; eye.dispose(); return; }
  const size = table().layouts.landscape.window;
  win = renderWindow(`${doc().get('name')}`, Math.round(size[0] / 2), Math.round(size[1] / 2), PlayWindow, 0x000000);
}
